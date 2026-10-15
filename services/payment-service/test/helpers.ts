import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  generateDevPrivateKey,
  JwtVerifier,
  loadPrivateKey,
  setupApp,
  signAccessToken,
  type AuthUser,
} from '@san/nest-common';
import type { OrderPlacedPayload, SanEvent } from '@san/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { MarketplaceClient, type MyShopInfo } from '../src/clients/marketplace.client';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../src/gateway/gateway';
import { PrismaService } from '../src/prisma.service';
import { ReceiptStorage } from '../src/refunds/receipt-storage.service';

export const API = '/api/payment/v1';
export const describeDb = process.env.TEST_DB ? describe : describe.skip;

const privateKey = loadPrivateKey(generateDevPrivateKey());

export function makeUser(name: string, permissions: AuthUser['permissions'] = []) {
  const user: AuthUser = {
    id: randomUUID(),
    email: `${randomUUID().slice(0, 8)}@san.vn`,
    name,
    permissions,
  };
  return { ...user, token: signAccessToken(user, privateKey) };
}

/** Kho biên lai giả: giữ file trong bộ nhớ */
export class FakeReceipts {
  files = new Map<string, Buffer>();
  async put(key: string, body: Buffer): Promise<void> {
    this.files.set(key, body);
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
  assertUsable = ReceiptStorage.prototype.assertUsable;
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  receipts: FakeReceipts;
  /** marketplace-service giả: hồ sơ shop của seller khi rút tiền (P5) */
  marketplace: { myShop: jest.Mock<Promise<MyShopInfo>, [string]> };
  http: () => ReturnType<typeof request>;
}

/** Chạy cả app với database thật; mặc định cổng MÔ PHỎNG (không có khóa VNPay) */
export async function createTestApp(gateway?: PaymentGateway): Promise<TestApp> {
  const receipts = new FakeReceipts();
  const marketplace = { myShop: jest.fn<Promise<MyShopInfo>, [string]>() };
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifier)
    .useValue(new JwtVerifier({ privateKey }))
    .overrideProvider(ReceiptStorage)
    .useValue(receipts)
    .overrideProvider(MarketplaceClient)
    .useValue(marketplace);
  if (gateway) builder = builder.overrideProvider(PAYMENT_GATEWAY).useValue(gateway);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { apiPrefix: 'api/payment/v1', title: 'test', description: 'test' });
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    receipts,
    marketplace,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE cod_reconciliation_items, cod_reconciliations, wallet_transactions, withdrawals, seller_wallets, refunds, payments, seller_earnings, settings, audit_logs, outbox_events, inbox_events CASCADE',
  );
}

/** Payload order.placed mẫu: 2 đơn con, shop A 200.000đ (voucher shop 20.000đ), shop B 100.000đ */
export function placedOrder(buyer: AuthUser, overrides: Partial<OrderPlacedPayload> = {}) {
  const orderId = randomUUID();
  const code = `261011${randomUUID().slice(0, 6).toUpperCase()}`;
  const payload: OrderPlacedPayload = {
    orderId,
    code,
    buyer: { userId: buyer.id, name: buyer.name, email: buyer.email },
    paymentMethod: 'VNPAY',
    total: 290_000,
    payBefore: new Date(Date.now() + 15 * 60_000).toISOString(),
    shippingProvince: 'Hà Nội',
    placedAt: new Date().toISOString(),
    shopOrders: [
      {
        shopOrderId: randomUUID(),
        code: `${code}-1`,
        shopId: randomUUID(),
        shopName: 'Shop A',
        ownerId: randomUUID(),
        subtotal: 200_000,
        shopDiscount: 20_000,
        platformDiscount: 32_143,
        shippingFee: 30_000,
        total: 177_857,
        items: [{ name: 'Áo thun', variant: '', price: 200_000, quantity: 1 }],
      },
      {
        shopOrderId: randomUUID(),
        code: `${code}-2`,
        shopId: randomUUID(),
        shopName: 'Shop B',
        ownerId: randomUUID(),
        subtotal: 100_000,
        shopDiscount: 0,
        platformDiscount: 17_857,
        shippingFee: 30_000,
        total: 112_143,
        items: [{ name: 'Tai nghe', variant: '', price: 100_000, quantity: 1 }],
      },
    ],
    ...overrides,
  };
  return payload;
}

/** Nội dung các sự kiện đã ghi vào outbox theo loại */
export async function outbox(prisma: PrismaService, type: string) {
  const rows = await prisma.outboxEvent.findMany({
    where: { type },
    orderBy: { createdAt: 'asc' },
  });
  return rows.map(
    (r) => (r.payload as unknown as SanEvent).payload as unknown as Record<string, unknown>,
  );
}
