import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { JwtVerifier, TokenError } from '@san/nest-common';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server as HttpServer } from 'node:http';
import { createClient } from 'redis';
import { Server, type Socket } from 'socket.io';
import { AppConfig } from '../config';

/** Đường dẫn Socket.IO (nằm dưới tiền tố API của marketplace để Ingress/NGINX/Vite chuyển cùng chỗ) */
export const SOCKET_PATH = '/api/market/v1/socket.io';

/** Phòng riêng của một người: mọi tab, mọi thiết bị của người đó cùng nhận */
export const userRoom = (userId: string) => `user:${userId}`;

/** Lý do từ chối kết nối, gửi trong `err.data.code` để web biết cần lấy vé mới */
export type SocketAuthErrorCode = 'UNAUTHENTICATED' | 'TOKEN_EXPIRED';

/** Các sự kiện server gửi tới trình duyệt (docs/api/README.md mục 7, "Realtime") */
export interface ServerEvents {
  'notification:new': { notification: unknown; unreadCount: number };
  'chat:message': { conversationId: string; message: unknown };
  'chat:read': { conversationId: string; role: 'BUYER' | 'SHOP' };
}

/** Lỗi trả cho trình duyệt khi từ chối kết nối (`connect_error`) */
export class SocketAuthError extends Error {
  readonly data: { code: SocketAuthErrorCode };
  constructor(code: SocketAuthErrorCode, message: string) {
    super(message);
    this.data = { code };
  }
}

/** Chờ Redis lúc khởi động tối đa bao lâu; quá thì chạy không có Redis (chỉ đẩy trong một bản) */
const REDIS_CONNECT_MS = 3000;

/** Client Redis đang mở (để đóng khi tắt service) */
type RedisClient = { destroy(): void };

/**
 * Realtime (P6, MSG-01, MSG-02): trình duyệt kết nối Socket.IO ở `SOCKET_PATH` (cùng cổng HTTP của service),
 * gửi access token trong `auth.token`. Vé sai hoặc hết hạn thì bị từ chối (`connect_error` có `data.code`),
 * web lấy vé mới rồi nối lại. Mỗi người vào phòng `user:<userId>`. Web không gửi gì qua socket: mọi thao tác
 * đi bằng REST, server chỉ đẩy `notification:new`, `chat:message`, `chat:read` sau khi dữ liệu đã lưu.
 *
 * Có `REDIS_URL` (và không phải lúc chạy test) thì dùng Redis adapter: chạy nhiều bản service, tin đẩy ở bản
 * này tới được người đang nối vào bản khác. Redis lỗi lúc khởi động thì ghi log và chạy như một bản.
 */
@Injectable()
export class RealtimeGateway implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Realtime');
  private io?: Server;
  private redis: RedisClient[] = [];

  constructor(
    private readonly verifier: JwtVerifier,
    private readonly adapterHost: HttpAdapterHost,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const http = this.adapterHost.httpAdapter?.getHttpServer() as HttpServer | undefined;
    if (!http) return;
    const io = new Server(http, { path: SOCKET_PATH, serveClient: false });
    if (this.config.redisUrl && process.env.NODE_ENV !== 'test') {
      const adapter = await this.connectRedis(this.config.redisUrl);
      if (adapter) io.adapter(adapter);
    }
    io.use((socket, next) => {
      this.authenticate(socket).then(
        () => next(),
        (e: Error) => next(e),
      );
    });
    this.io = io;
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.io) {
      this.io.disconnectSockets(true);
      this.io.engine.close();
      this.io = undefined;
    }
    for (const c of this.redis) c.destroy();
    this.redis = [];
  }

  /** Kiểm vé lúc bắt tay; đúng thì ghi người dùng vào socket và vào phòng riêng */
  async authenticate(socket: Pick<Socket, 'handshake' | 'data' | 'join'>): Promise<string> {
    const raw: unknown = socket.handshake.auth?.token;
    const token = typeof raw === 'string' ? raw.replace(/^Bearer /, '') : '';
    if (!token) throw new SocketAuthError('UNAUTHENTICATED', 'Bạn cần đăng nhập.');
    let userId: string;
    try {
      userId = (await this.verifier.verify(token)).id;
    } catch (e) {
      if (e instanceof TokenError && e.expired) {
        throw new SocketAuthError('TOKEN_EXPIRED', 'Phiên đăng nhập đã hết hạn.');
      }
      if (!(e instanceof TokenError)) {
        this.logger.warn(`Không kiểm được vé của kết nối realtime: ${(e as Error).message}`);
      }
      throw new SocketAuthError('UNAUTHENTICATED', 'Bạn cần đăng nhập.');
    }
    (socket.data as { userId?: string }).userId = userId;
    await socket.join(userRoom(userId));
    return userId;
  }

  /** Đẩy một sự kiện tới mọi kết nối của một người (qua Redis adapter nếu chạy nhiều bản) */
  emitToUser<E extends keyof ServerEvents>(userId: string, event: E, data: ServerEvents[E]): void {
    this.io?.to(userRoom(userId)).emit(event, data);
  }

  /** Nối Redis; không được (đã ghi log) thì trả undefined, service vẫn chạy */
  private async connectRedis(url: string): Promise<ReturnType<typeof createAdapter> | undefined> {
    const pub = createClient({
      url,
      socket: {
        connectTimeout: REDIS_CONNECT_MS,
        reconnectStrategy: (retries) => Math.min(retries * 500, 5000),
      },
    });
    const sub = pub.duplicate();
    let lastError = '';
    for (const c of [pub, sub]) {
      c.on('error', (e: Error) => {
        // Chỉ ghi khi lỗi đổi, tránh lặp log mỗi lần client tự nối lại
        if (e.message !== lastError) this.logger.warn(`Redis lỗi: ${e.message}`);
        lastError = e.message;
      });
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.all([pub.connect(), sub.connect()]),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('quá thời gian chờ')), REDIS_CONNECT_MS);
        }),
      ]);
    } catch (e) {
      this.logger.warn(
        `Không nối được Redis (${(e as Error).message}): realtime chỉ đẩy tin trong bản service này.`,
      );
      pub.destroy();
      sub.destroy();
      return undefined;
    } finally {
      clearTimeout(timer);
    }
    this.redis = [pub, sub];
    this.logger.log('Socket.IO dùng Redis adapter.');
    return createAdapter(pub, sub);
  }
}
