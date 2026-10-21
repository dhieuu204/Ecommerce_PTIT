import {
  generateDevPrivateKey,
  JwtVerifier,
  loadPrivateKey,
  signAccessToken,
} from '@san/nest-common';
import type { HttpAdapterHost } from '@nestjs/core';
import type { AppConfig } from '../config';
import { RealtimeGateway, SocketAuthError, userRoom } from './realtime.gateway';

const key = loadPrivateKey(generateDevPrivateKey());
const user = {
  id: '7f3c1e2a-0000-4000-8000-000000000001',
  email: 'a@b.vn',
  name: 'An',
  permissions: [],
};

function gateway(): RealtimeGateway {
  return new RealtimeGateway(
    new JwtVerifier({ privateKey: key }),
    {} as HttpAdapterHost,
    { redisUrl: '' } as AppConfig,
  );
}

function socket(auth: Record<string, unknown>) {
  return { handshake: { auth }, data: {} as { userId?: string }, join: jest.fn() };
}

describe('RealtimeGateway: kiểm vé lúc kết nối Socket.IO (P6)', () => {
  afterEach(() => jest.useRealTimers());

  it('vé đúng: ghi người dùng, vào phòng user:<id>', async () => {
    const s = socket({ token: signAccessToken(user, key) });
    await expect(gateway().authenticate(s as never)).resolves.toBe(user.id);
    expect(s.data.userId).toBe(user.id);
    expect(s.join).toHaveBeenCalledWith(`user:${user.id}`);
  });

  it('không có vé hoặc vé sai: từ chối với UNAUTHENTICATED, không vào phòng nào', async () => {
    const other = loadPrivateKey(generateDevPrivateKey());
    for (const auth of [
      {},
      { token: '' },
      { token: 123 },
      { token: 'abc' },
      { token: signAccessToken(user, other) },
    ]) {
      const s = socket(auth);
      const err = await gateway()
        .authenticate(s as never)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(SocketAuthError);
      expect((err as SocketAuthError).data).toEqual({ code: 'UNAUTHENTICATED' });
      expect(s.join).not.toHaveBeenCalled();
    }
  });

  it('vé hết hạn: từ chối với TOKEN_EXPIRED để web lấy vé mới', async () => {
    const token = signAccessToken(user, key);
    jest.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    const err = await gateway()
      .authenticate(socket({ token }) as never)
      .catch((e: unknown) => e);
    expect((err as SocketAuthError).data).toEqual({ code: 'TOKEN_EXPIRED' });
  });

  it('đẩy tin tới đúng phòng của người nhận', () => {
    const g = gateway();
    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    (g as unknown as { io: unknown }).io = { to };
    g.emitToUser(user.id, 'chat:read', { conversationId: 'c1', role: 'SHOP' });
    expect(to).toHaveBeenCalledWith(userRoom(user.id));
    expect(emit).toHaveBeenCalledWith('chat:read', { conversationId: 'c1', role: 'SHOP' });
  });

  it('chưa gắn Socket.IO (không có HTTP server) thì đẩy tin không lỗi', () => {
    expect(() =>
      gateway().emitToUser(user.id, 'notification:new', { notification: {}, unreadCount: 1 }),
    ).not.toThrow();
  });
});
