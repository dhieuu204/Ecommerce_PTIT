import { randomUUID } from 'node:crypto';
import type { AuthUser } from '@san/nest-common';
import {
  AFFILIATE_DECIDED,
  type AffiliateApplicationSubmittedPayload,
  type SanEvent,
} from '@san/shared';
import { AffiliateApprovalsService } from '../src/affiliate-approvals/affiliate-approvals.service';
import type { Prisma } from '../generated/prisma';
import { createTestApp, describeDb, makeUser, resetDb, type TestApp } from './helpers';

const API = '/api/approval/v1';

describeDb('Duyệt, khóa, mở cộng tác viên (P7: AFF-01)', () => {
  let t: TestApp;
  const mod = makeUser('Kiểm Duyệt', ['MODERATION']);
  const mod2 = makeUser('Kiểm Duyệt 2', ['MODERATION']);
  const finance = makeUser('Tài Chính', ['FINANCE']);
  /** CTV kiêm admin kiểm duyệt: không được tự quyết hồ sơ của mình */
  const ctv = makeUser('Trần Thị Bình', ['MODERATION']);

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());
  beforeEach(() => resetDb(t.prisma));

  const run = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => t.prisma.$transaction(fn);
  const as = (u: AuthUser) => ({ Authorization: `Bearer ${t.token(u)}` });
  const outbox = async (type: string) =>
    (await t.prisma.outboxEvent.findMany({ where: { type }, orderBy: { createdAt: 'asc' } })).map(
      (e) => (e.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
    );
  const svc = () => t.app.get(AffiliateApprovalsService);

  function submitted(affiliateId: string, version = 1): AffiliateApplicationSubmittedPayload {
    return {
      affiliateId,
      version,
      user: { userId: ctv.id, name: ctv.name, email: 'binh@gmail.com' },
      data: {
        displayName: 'Review Công Nghệ',
        channels: ['https://www.tiktok.com/@reviewcongnghe'],
        phone: '0912345678',
        bankAccount: {
          bankName: 'Techcombank',
          accountNumberMasked: '****6789',
          accountName: 'TRAN THI BINH',
        },
      },
      submittedAt: new Date().toISOString(),
    };
  }
  const list = (u: AuthUser = mod, query = '') =>
    t.http().get(`${API}/admin/affiliate-approvals${query}`).set(as(u));
  const decide = (id: string, body: object, u: AuthUser = mod) =>
    t.http().post(`${API}/admin/affiliate-approvals/${id}/decision`).set(as(u)).send(body);
  const suspension = (affiliateId: string, body: object, u: AuthUser = mod) =>
    t.http().post(`${API}/admin/affiliates/${affiliateId}/suspension`).set(as(u)).send(body);

  /** Hồ sơ đang chờ, trả mã hồ sơ duyệt */
  async function pending(affiliateId = randomUUID()) {
    await run((tx) => svc().onSubmitted(submitted(affiliateId), tx));
    const res = await list().expect(200);
    return { affiliateId, id: res.body.items[0].id as string };
  }

  it('nhận hồ sơ một lần; bản mới thay bản cũ đang chờ; chỉ MODERATION xem được', async () => {
    const affiliateId = randomUUID();
    await run((tx) => svc().onSubmitted(submitted(affiliateId), tx));
    await run((tx) => svc().onSubmitted(submitted(affiliateId), tx));
    await run((tx) => svc().onSubmitted(submitted(affiliateId, 2), tx));
    // Bản cũ tới sau bản mới: lưu là REPLACED
    const other = randomUUID();
    await run((tx) => svc().onSubmitted(submitted(other, 2), tx));
    await run((tx) => svc().onSubmitted(submitted(other, 1), tx));
    const res = await list().expect(200);
    expect(res.body.items.map((i: { version: number }) => i.version)).toEqual([2, 2]);
    expect(res.body.items[0]).toMatchObject({ displayName: 'Review Công Nghệ', type: 'REGISTER' });
    await list(finance).expect(403);
  });

  it('duyệt: phát affiliate.decided đúng phiên bản, ghi nhật ký; không tự duyệt, không quyết hai lần', async () => {
    const { affiliateId, id } = await pending();
    const self = await decide(id, { decision: 'APPROVE' }, ctv).expect(403);
    expect(self.body.code).toBe('SELF_APPROVAL_FORBIDDEN');
    await decide(id, { decision: 'REJECT' }).expect(400);
    await decide(id, { decision: 'APPROVE' }).expect(200);
    await decide(id, { decision: 'REJECT', reason: 'Thiếu kênh' }, mod2).expect(409);
    expect(await outbox(AFFILIATE_DECIDED)).toEqual([
      expect.objectContaining({ affiliateId, action: 'APPROVE', version: 1, reason: null }),
    ]);
    expect(await t.prisma.auditLog.count({ where: { action: 'APPROVE_AFFILIATE' } })).toBe(1);
  });

  it('khóa/mở: chỉ CTV đã duyệt, không lặp trạng thái, lịch sử hiện ở chi tiết', async () => {
    const { affiliateId, id } = await pending();
    const early = await suspension(affiliateId, {
      action: 'SUSPEND',
      reason: 'Spam link ở nhiều nhóm',
    }).expect(409);
    expect(early.body.code).toBe('AFFILIATE_NOT_APPROVED');
    await decide(id, { decision: 'APPROVE' }).expect(200);
    await suspension(affiliateId, { action: 'SUSPEND', reason: 'ngắn' }).expect(400);
    await suspension(affiliateId, { action: 'RESTORE', reason: 'Mở lại sau khi xác minh' }).expect(
      409,
    );
    await suspension(
      affiliateId,
      { action: 'SUSPEND', reason: 'Spam link ở nhiều nhóm' },
      ctv,
    ).expect(403);
    const s = await suspension(affiliateId, {
      action: 'SUSPEND',
      reason: 'Spam link ở nhiều nhóm',
    }).expect(200);
    expect(s.body.history.map((h: { type: string }) => h.type)).toEqual(['SUSPEND', 'REGISTER']);
    await suspension(affiliateId, { action: 'SUSPEND', reason: 'Spam link ở nhiều nhóm' }).expect(
      409,
    );
    await suspension(affiliateId, { action: 'RESTORE', reason: 'Đã gỡ link spam, mở lại' }).expect(
      200,
    );
    const events = await outbox(AFFILIATE_DECIDED);
    expect(events.map((e) => [e.action, e.version])).toEqual([
      ['APPROVE', 1],
      ['SUSPEND', null],
      ['RESTORE', null],
    ]);
    expect(
      await t.prisma.auditLog.count({
        where: { action: { in: ['SUSPEND_AFFILIATE', 'RESTORE_AFFILIATE'] } },
      }),
    ).toBe(2);
  });
});
