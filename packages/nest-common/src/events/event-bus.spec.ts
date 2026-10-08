import {
  SHOP_APPLICATION_DECIDED,
  type SanEvent,
  type ShopApplicationDecidedPayload,
} from '@san/shared';
import { Logger } from '@nestjs/common';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { runWithCorrelationId } from '../context/request-context';
import { EventBus } from './event-bus';

/** Database giả trong bộ nhớ: outbox, inbox; giao dịch lỗi thì hoàn tác inbox */
function fakeDb() {
  const outbox: Array<{ id: string; type: string; payload: unknown; sentAt: Date | null }> = [];
  let inbox = new Set<string>();
  const db = {
    outbox,
    inbox: () => inbox,
    outboxEvent: {
      create: async ({ data }: { data: { id: string; type: string; payload: unknown } }) => {
        outbox.push({ ...data, sentAt: null });
      },
      findMany: async () => outbox.filter((r) => !r.sentAt),
      update: async ({ where, data }: { where: { id: string }; data: { sentAt: Date } }) => {
        outbox.find((r) => r.id === where.id)!.sentAt = data.sentAt;
      },
    },
    inboxEvent: {
      createMany: async ({ data }: { data: Array<{ id: string }> }) => {
        const id = data[0]!.id;
        if (inbox.has(id)) return { count: 0 };
        inbox.add(id);
        return { count: 1 };
      },
    },
    $transaction: async <R>(fn: (tx: unknown) => Promise<R>): Promise<R> => {
      const before = new Set(inbox);
      try {
        return await fn(db);
      } catch (e) {
        inbox = before;
        throw e;
      }
    },
  };
  return db;
}

function fakeChannel() {
  return {
    publish: jest.fn(),
    waitForConfirms: jest.fn().mockResolvedValue(undefined),
    sendToQueue: jest.fn(),
    ack: jest.fn(),
  };
}

const payload: ShopApplicationDecidedPayload = {
  shopId: 's-1',
  version: 2,
  type: 'REGISTER',
  decision: 'APPROVED',
  reason: null,
  decidedBy: { userId: 'admin-1', name: 'Bình' },
  decidedAt: '2026-10-08T10:00:00.000Z',
};

const QUEUE = 'marketplace-service.shop_application.decided';

function message(event: unknown, retry?: number): ConsumeMessage {
  return {
    content: Buffer.from(typeof event === 'string' ? event : JSON.stringify(event)),
    properties: { headers: retry === undefined ? {} : { 'x-san-retry': retry } },
  } as unknown as ConsumeMessage;
}

describe('EventBus', () => {
  let db: ReturnType<typeof fakeDb>;
  let bus: EventBus;
  let channel: ReturnType<typeof fakeChannel>;
  // Gọi các hàm nội bộ để test không cần RabbitMQ thật
  const internals = () =>
    bus as unknown as {
      channel?: ConfirmChannel;
      relayOutbox(): Promise<void>;
      handleMessage(ch: ConfirmChannel, queue: string, msg: ConsumeMessage): Promise<void>;
    };
  const handle = (msg: ConsumeMessage) =>
    internals().handleMessage(channel as unknown as ConfirmChannel, QUEUE, msg);

  beforeEach(() => {
    db = fakeDb();
    channel = fakeChannel();
    bus = new EventBus(
      { service: 'marketplace-service', prisma: Object },
      db as unknown as ConstructorParameters<typeof EventBus>[1],
    );
    Logger.overrideLogger(false);
  });

  async function publishOne(): Promise<SanEvent<typeof SHOP_APPLICATION_DECIDED>> {
    await runWithCorrelationId('corr-1', () => bus.publish(db, SHOP_APPLICATION_DECIDED, payload));
    return db.outbox[0]!.payload as SanEvent<typeof SHOP_APPLICATION_DECIDED>;
  }

  it('publish ghi đủ vỏ sự kiện vào outbox, chưa gửi', async () => {
    const event = await publishOne();
    expect(event).toMatchObject({
      type: 'shop_application.decided',
      version: 1,
      producer: 'marketplace-service',
      correlationId: 'corr-1',
      payload,
    });
    expect(db.outbox[0]!.id).toBe(event.eventId);
    expect(db.outbox[0]!.sentAt).toBeNull();
  });

  it('relay đẩy dòng chưa gửi lên exchange san.events rồi đánh dấu đã gửi', async () => {
    const event = await publishOne();
    internals().channel = channel as unknown as ConfirmChannel;
    await internals().relayOutbox();
    expect(channel.publish).toHaveBeenCalledWith(
      'san.events',
      'shop_application.decided',
      Buffer.from(JSON.stringify(event)),
      expect.objectContaining({ persistent: true, messageId: event.eventId }),
    );
    expect(db.outbox[0]!.sentAt).toBeInstanceOf(Date);
    await internals().relayOutbox();
    expect(channel.publish).toHaveBeenCalledTimes(1);
  });

  it('nhận một sự kiện hai lần thì chỉ xử lý một lần', async () => {
    const event = await publishOne();
    const handler = jest.fn().mockResolvedValue(undefined);
    bus.subscribe(SHOP_APPLICATION_DECIDED, handler);
    await handle(message(event));
    await handle(message(event));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload, db, event);
    expect(channel.ack).toHaveBeenCalledTimes(2);
  });

  it('xử lý lỗi thì đưa vào hàng chờ thử lại, lần sau xử lý lại được', async () => {
    const event = await publishOne();
    const handler = jest
      .fn()
      .mockRejectedValueOnce(new Error('DB bận'))
      .mockResolvedValue(undefined);
    bus.subscribe(SHOP_APPLICATION_DECIDED, handler);
    await handle(message(event));
    expect(channel.sendToQueue).toHaveBeenCalledWith(
      `${QUEUE}.retry`,
      expect.any(Buffer),
      expect.objectContaining({ expiration: '10000', headers: { 'x-san-retry': 1 } }),
    );
    expect(db.inbox().has(event.eventId)).toBe(false); // giao dịch lỗi đã hoàn tác
    await handle(message(event, 1));
    expect(handler).toHaveBeenCalledTimes(2);
    expect(db.inbox().has(event.eventId)).toBe(true);
  });

  it('lỗi sau 3 lần thử thì chuyển vào hàng lỗi .dlq', async () => {
    const event = await publishOne();
    bus.subscribe(SHOP_APPLICATION_DECIDED, jest.fn().mockRejectedValue(new Error('hỏng')));
    await handle(message(event, 2));
    expect(channel.sendToQueue).toHaveBeenLastCalledWith(
      `${QUEUE}.retry`,
      expect.any(Buffer),
      expect.objectContaining({ expiration: '300000' }),
    );
    await handle(message(event, 3));
    expect(channel.sendToQueue).toHaveBeenLastCalledWith(`${QUEUE}.dlq`, expect.any(Buffer), {
      persistent: true,
    });
  });

  it('tin không đọc được thì chuyển thẳng vào .dlq', async () => {
    await handle(message('không phải JSON'));
    expect(channel.sendToQueue).toHaveBeenCalledWith(`${QUEUE}.dlq`, expect.any(Buffer), {
      persistent: true,
    });
    expect(channel.ack).toHaveBeenCalled();
  });

  it('không cho đăng ký hai handler cho cùng một sự kiện', () => {
    bus.subscribe(SHOP_APPLICATION_DECIDED, jest.fn());
    expect(() => bus.subscribe(SHOP_APPLICATION_DECIDED, jest.fn())).toThrow();
  });
});
