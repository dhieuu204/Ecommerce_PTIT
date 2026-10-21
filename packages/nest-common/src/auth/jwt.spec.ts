import { createPrivateKey } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { generateDevPrivateKey, JwtVerifier, signAccessToken, toJwks, TokenError } from './jwt';

describe('JwtVerifier dùng JWKS (cách 3 service còn lại kiểm vé)', () => {
  const key = createPrivateKey(generateDevPrivateKey());
  let server: Server;
  let url: string;
  let calls = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      calls++;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(toJwks(key)));
    });
    await new Promise<void>((r) => server.listen(0, r));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks.json`;
  });

  afterAll(() => new Promise((r) => server.close(r)));

  it('tải khóa một lần rồi dùng lại', async () => {
    const verifier = new JwtVerifier({ jwksUrl: url });
    const user = { id: 'u-1', email: 'a@b.vn', name: 'An', permissions: ['SUPPORT' as const] };
    await expect(verifier.verify(signAccessToken(user, key))).resolves.toEqual(user);
    await expect(verifier.verify(signAccessToken(user, key))).resolves.toEqual(user);
    expect(calls).toBe(1);
  });

  it('nhiều vé tới cùng lúc khi chưa có khóa: chờ chung một lần tải, không vé nào bị từ chối', async () => {
    const verifier = new JwtVerifier({ jwksUrl: url });
    const before = calls;
    const user = { id: 'u-2', email: 'b@b.vn', name: 'Bình', permissions: [] };
    const token = signAccessToken(user, key);
    const results = await Promise.all([1, 2, 3].map(() => verifier.verify(token)));
    expect(results).toEqual([user, user, user]);
    expect(calls - before).toBe(1);
  });

  it('vé của khóa lạ thì báo vé không hợp lệ', async () => {
    const verifier = new JwtVerifier({ jwksUrl: url });
    const other = createPrivateKey(generateDevPrivateKey());
    const token = signAccessToken({ id: 'x', email: 'x', name: 'x', permissions: [] }, other);
    await expect(verifier.verify(token)).rejects.toEqual(new TokenError(false));
  });

  it('chuỗi không phải JWT thì báo vé không hợp lệ', async () => {
    await expect(new JwtVerifier({ jwksUrl: url }).verify('abc')).rejects.toBeInstanceOf(
      TokenError,
    );
  });
});
