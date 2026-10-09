import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import {
  EVENTS_EXCHANGE,
  type EventPayloads,
  type EventType,
  type SanEvent,
  type ServiceName,
} from '@san/shared';
import amqp, { type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';
import { randomUUID } from 'node:crypto';
import { currentCorrelationId, runWithCorrelationId } from '../context/request-context';
import type {
  InboxDb,
  JsonObject,
  OutboxDb,
  OutboxRelayDb,
  TransactionRunner,
} from '../db/db-types';
import { SAN_OPTIONS, SAN_PRISMA, type SanCommonOptions } from '../options';

/** Xử lý một sự kiện nhận được. `tx` là giao dịch Prisma: ghi dữ liệu bằng tx để đi cùng bản ghi inbox. */
export type EventHandler<T extends EventType, Tx> = (
  payload: EventPayloads[T],
  tx: Tx,
  event: SanEvent<T>,
) => Promise<void>;

/** Thử lại sau 10 giây, 1 phút, 5 phút; vẫn lỗi thì chuyển vào hàng đợi lỗi (.dlq). */
const RETRY_DELAYS_MS = [10_000, 60_000, 300_000];
const RETRY_HEADER = 'x-san-retry';

type BusDb = OutboxRelayDb & TransactionRunner<InboxDb>;

/**
 * Gửi và nhận sự kiện giữa các service qua RabbitMQ (docs/api/events.md).
 *
 * Gửi: `await events.publish(tx, SHOP_APPLICATION_SUBMITTED, payload)` trong cùng giao dịch với dữ liệu.
 * Sự kiện được ghi vào bảng outbox_events; mỗi giây có một vòng lặp đẩy các dòng chưa gửi lên RabbitMQ.
 *
 * Nhận: `events.subscribe(SHOP_APPLICATION_DECIDED, async (payload, tx) => { ... })` trong onModuleInit.
 * Mỗi sự kiện được xử lý đúng một lần nhờ bảng inbox_events.
 */
@Injectable()
export class EventBus implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Sự kiện');
  private readonly handlers = new Map<string, EventHandler<EventType, unknown>>();
  private connection?: ChannelModel;
  private channel?: ConfirmChannel;
  private relayTimer?: NodeJS.Timeout;
  private relayRunning = false;
  private stopped = false;

  constructor(
    @Inject(SAN_OPTIONS) private readonly options: SanCommonOptions,
    @Inject(SAN_PRISMA) private readonly db: BusDb,
  ) {}

  private get service(): ServiceName {
    return this.options.service;
  }

  /** Ghi sự kiện vào outbox trong giao dịch `tx`. Sự kiện chỉ được gửi nếu giao dịch thành công. */
  async publish<T extends EventType>(
    tx: OutboxDb,
    type: T,
    payload: EventPayloads[T],
  ): Promise<void> {
    const event: SanEvent<T> = {
      eventId: randomUUID(),
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      producer: this.service,
      correlationId: currentCorrelationId(),
      payload,
    };
    await tx.outboxEvent.create({
      data: { id: event.eventId, type, payload: event as unknown as JsonObject },
    });
  }

  /** Đăng ký xử lý một loại sự kiện. Gọi trong onModuleInit của module nhận sự kiện. */
  subscribe<T extends EventType, Tx = unknown>(type: T, handler: EventHandler<T, Tx>): void {
    if (this.handlers.has(type)) throw new Error(`Đã có handler cho sự kiện ${type}`);
    this.handlers.set(type, handler as unknown as EventHandler<EventType, unknown>);
  }

  onApplicationBootstrap(): void {
    if (!this.options.rabbitmqUrl) {
      this.logger.warn('Chưa đặt RABBITMQ_URL: không gửi/nhận sự kiện.');
      return;
    }
    void this.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearInterval(this.relayTimer);
    await this.connection?.close().catch(() => undefined);
  }

  // ----- Kết nối RabbitMQ (tự kết nối lại sau 5 giây nếu mất) -----

  private async connect(): Promise<void> {
    try {
      const connection = await amqp.connect(this.options.rabbitmqUrl!);
      // App đã tắt trong lúc đang kết nối: đóng luôn, không để kết nối treo giữ tiến trình
      if (this.stopped) {
        await connection.close().catch(() => undefined);
        return;
      }
      const channel = await connection.createConfirmChannel();
      connection.on('error', (e: Error) => this.logger.error(`RabbitMQ lỗi: ${e.message}`));
      connection.on('close', () => this.reconnectLater());
      await channel.assertExchange(EVENTS_EXCHANGE, 'topic', { durable: true });
      await channel.prefetch(10);
      for (const type of this.handlers.keys()) await this.setupQueue(channel, type);
      this.connection = connection;
      this.channel = channel;
      this.relayTimer = setInterval(() => void this.relayOutbox(), 1000);
      this.logger.log(`Đã kết nối RabbitMQ, nhận ${this.handlers.size} loại sự kiện.`);
    } catch (e) {
      this.logger.warn(`Chưa kết nối được RabbitMQ (${(e as Error).message}), thử lại sau 5 giây.`);
      this.reconnectLater();
    }
  }

  private reconnectLater(): void {
    clearInterval(this.relayTimer);
    this.channel = undefined;
    this.connection = undefined;
    if (!this.stopped) setTimeout(() => void this.connect(), 5000);
  }

  /** Hàng đợi `<service>.<sự kiện>`, kèm hàng chờ thử lại `.retry` và hàng lỗi `.dlq`. */
  private async setupQueue(channel: ConfirmChannel, type: string): Promise<void> {
    const queue = `${this.service}.${type}`;
    await channel.assertQueue(queue, { durable: true });
    await channel.bindQueue(queue, EVENTS_EXCHANGE, type);
    // Tin trong .retry hết hạn chờ thì tự quay về hàng đợi chính
    await channel.assertQueue(`${queue}.retry`, {
      durable: true,
      deadLetterExchange: '',
      deadLetterRoutingKey: queue,
    });
    await channel.assertQueue(`${queue}.dlq`, { durable: true });
    await channel.consume(queue, (msg) => msg && void this.handleMessage(channel, queue, msg));
  }

  // ----- Gửi: đẩy outbox lên RabbitMQ -----

  private async relayOutbox(): Promise<void> {
    const channel = this.channel;
    if (!channel || this.relayRunning) return;
    this.relayRunning = true;
    try {
      const rows = await this.db.outboxEvent.findMany({
        where: { sentAt: null },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const row of rows) {
        const event = row.payload as SanEvent;
        channel.publish(EVENTS_EXCHANGE, event.type, Buffer.from(JSON.stringify(event)), {
          persistent: true,
          contentType: 'application/json',
          messageId: event.eventId,
        });
        await channel.waitForConfirms();
        await this.db.outboxEvent.update({ where: { id: row.id }, data: { sentAt: new Date() } });
      }
    } catch (e) {
      this.logger.error(`Gửi outbox lỗi: ${(e as Error).message}`);
    } finally {
      this.relayRunning = false;
    }
  }

  // ----- Nhận: xử lý một lần nhờ inbox, lỗi thì thử lại -----

  private async handleMessage(channel: ConfirmChannel, queue: string, msg: ConsumeMessage) {
    let event: SanEvent;
    try {
      event = JSON.parse(msg.content.toString()) as SanEvent;
    } catch {
      this.logger.error(`Tin không đọc được ở ${queue}, chuyển vào .dlq`);
      channel.sendToQueue(`${queue}.dlq`, msg.content, { persistent: true });
      channel.ack(msg);
      return;
    }
    const handler = this.handlers.get(event.type);
    try {
      await runWithCorrelationId(event.correlationId, () =>
        this.db.$transaction(async (tx) => {
          const { count } = await tx.inboxEvent.createMany({
            data: [{ id: event.eventId, type: event.type }],
            skipDuplicates: true,
          });
          if (count === 0) return; // đã xử lý rồi (RabbitMQ giao lại)
          await handler?.(event.payload, tx, event);
        }),
      );
      channel.ack(msg);
    } catch (e) {
      const retry = Number(msg.properties.headers?.[RETRY_HEADER] ?? 0);
      const delay = RETRY_DELAYS_MS[retry];
      if (delay !== undefined) {
        this.logger.warn(
          `Xử lý ${event.type} lỗi (${(e as Error).message}), thử lại lần ${retry + 1}`,
        );
        channel.sendToQueue(`${queue}.retry`, msg.content, {
          persistent: true,
          expiration: String(delay),
          headers: { [RETRY_HEADER]: retry + 1 },
        });
      } else {
        this.logger.error(`Xử lý ${event.type} lỗi sau ${retry} lần thử, chuyển vào ${queue}.dlq`);
        channel.sendToQueue(`${queue}.dlq`, msg.content, { persistent: true });
      }
      channel.ack(msg);
    }
  }
}
