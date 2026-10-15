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
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GhnClient } from '../src/locations/ghn.client';
import { LocationsService } from '../src/locations/locations.service';
import { PrismaService } from '../src/prisma.service';
import { StorageService } from '../src/uploads/storage.service';
import { PaymentClient } from '../src/clients/payment.client';
import { UserClient } from '../src/clients/user.client';
import {
  SHIPPING_CARRIER,
  type CarrierShipment,
  type CreateShipmentInput,
  type ShippingCarrier,
} from '../src/shipping/carrier';

export const API = '/api/market/v1';
export const describeDb = process.env.TEST_DB ? describe : describe.skip;

/** Khóa ký vé giả cho test (thay cho JWKS của user-service) */
const privateKey = loadPrivateKey(generateDevPrivateKey());

export function makeUser(name = 'Nguyễn Văn An', permissions: AuthUser['permissions'] = []) {
  const user: AuthUser = {
    id: randomUUID(),
    email: `${name.split(' ').pop()!.toLowerCase()}${Math.floor(Math.random() * 1e6)}@gmail.com`,
    name,
    permissions,
  };
  return { ...user, token: signAccessToken(user, privateKey) };
}

/** Kho ảnh giả: giữ file trong bộ nhớ */
export class FakeStorage {
  files = new Map<string, Buffer>();
  /** Bucket riêng tư (ảnh bằng chứng trả hàng, P5) */
  privateFiles = new Map<string, Buffer>();
  fail = false;
  async putPublic(key: string, body: Buffer): Promise<string> {
    if (this.fail) throw new Error('MinIO lỗi (giả)');
    this.files.set(key, body);
    return this.publicUrl(key);
  }
  publicUrl(key: string): string {
    return `http://localhost:9000/san-public/${key}`;
  }
  async putPrivate(key: string, body: Buffer): Promise<void> {
    if (this.fail) throw new Error('MinIO lỗi (giả)');
    this.privateFiles.set(key, body);
  }
  async getPrivate(key: string): Promise<Readable> {
    const body = this.privateFiles.get(key);
    if (!body) throw new Error('Không có file (giả)');
    return Readable.from(body);
  }
}

/**
 * Đơn vị vận chuyển giả cho test (đóng vai bản MÔ PHỎNG). Đặt `createError` để giả GHN từ chối/lỗi mạng,
 * `loseResponse` để giả "GHN đã tạo nhưng sàn không nhận được trả lời", `cancelResult` cho lúc hủy.
 */
export class FakeCarrier implements ShippingCarrier {
  readonly kind = 'MOCK' as const;
  /** Mọi lần gọi tạo vận đơn (kể cả lần lỗi) */
  calls: CreateShipmentInput[] = [];
  /** Vận đơn GHN đang có, theo mã đơn con: GHN không cho trùng client_order_code */
  orders = new Map<string, CarrierShipment>();
  cancelled: string[] = [];
  createError: Error | null = null;
  loseResponse = false;
  cancelResult: 'CANCELLED' | 'ALREADY_PICKED' = 'CANCELLED';
  cancelError: Error | null = null;
  /** Có thì lần tạo vận đơn chờ tới khi promise này xong (giả lập GHN trả lời chậm) */
  gate: Promise<void> | null = null;
  private seq = 0;

  reset(): void {
    this.calls = [];
    this.orders.clear();
    this.cancelled = [];
    this.createError = null;
    this.loseResponse = false;
    this.cancelResult = 'CANCELLED';
    this.cancelError = null;
    this.gate = null;
    this.seq = 0;
  }

  async createOrder(input: CreateShipmentInput): Promise<CarrierShipment> {
    this.calls.push(input);
    if (this.gate) await this.gate;
    if (this.createError) throw this.createError;
    let found = this.orders.get(input.clientCode);
    if (!found) {
      found = { ghnCode: `SIMTEST${++this.seq}`, fee: 25_000 };
      this.orders.set(input.clientCode, found);
    }
    if (this.loseResponse) throw new Error('Hết thời gian chờ GHN (giả)');
    return found;
  }

  async findByClientCode(clientCode: string): Promise<CarrierShipment | null> {
    return this.orders.get(clientCode) ?? null;
  }

  async cancelOrder(ghnCode: string): Promise<'CANCELLED' | 'ALREADY_PICKED'> {
    if (this.cancelError) throw this.cancelError;
    if (this.cancelResult === 'CANCELLED') this.cancelled.push(ghnCode);
    return this.cancelResult;
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  storage: FakeStorage;
  ghn: {
    configured: boolean;
    provinces: jest.Mock;
    districts: jest.Mock;
    wards: jest.Mock;
    fee: jest.Mock;
  };
  /** Sổ địa chỉ giả của user-service (mặc định 1 địa chỉ Hà Nội) */
  users: { addresses: jest.Mock };
  /** payment-service giả */
  payments: { createPayment: jest.Mock };
  /** GHN giả */
  carrier: FakeCarrier;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(): Promise<TestApp> {
  const storage = new FakeStorage();
  const ghn = {
    configured: false,
    provinces: jest.fn(),
    districts: jest.fn(),
    wards: jest.fn(),
    fee: jest.fn(),
  };
  const users = { addresses: jest.fn(async () => [BUYER_ADDRESS]) };
  const payments = { createPayment: jest.fn() };
  const carrier = new FakeCarrier();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(JwtVerifier)
    .useValue(new JwtVerifier({ privateKey }))
    .overrideProvider(StorageService)
    .useValue(storage)
    .overrideProvider(GhnClient)
    .useValue(ghn)
    .overrideProvider(UserClient)
    .useValue(users)
    .overrideProvider(PaymentClient)
    .useValue(payments)
    .overrideProvider(SHIPPING_CARRIER)
    .useValue(carrier)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  setupApp(app, { apiPrefix: 'api/market/v1', title: 'test', description: 'test' });
  await app.init();
  return {
    app,
    prisma: app.get(PrismaService),
    storage,
    ghn,
    users,
    payments,
    carrier,
    http: () => request(app.getHttpServer()),
  };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE shop_applications, shops, audit_logs, outbox_events, inbox_events, cart_items, vouchers, stock_history, product_images, product_variants, products, categories, voucher_usages, checkouts, orders, shop_orders, order_items, order_history, shipments, shipment_history, returns, return_items, settings CASCADE',
  );
}

/** Nạp danh sách tỉnh/huyện/xã mẫu (Hà Nội 90001 › Ba Đình 90101 › Phường Điện Biên 9010101) */
export async function loadSampleLocations(t: TestApp): Promise<void> {
  t.ghn.configured = false;
  await t.app.get(LocationsService).sync();
}

export const PICKUP = {
  provinceId: 90001,
  districtId: 90101,
  wardCode: '9010101',
  street: '12 Kim Mã',
};

/** Địa chỉ mặc định của buyer trong sổ địa chỉ giả */
export const BUYER_ADDRESS = {
  id: '6f1c2a10-0000-4000-8000-000000000001',
  receiverName: 'Người Mua',
  phone: '0987654321',
  provinceId: 90001,
  districtId: 90101,
  wardCode: '9010101',
  provinceName: 'Hà Nội',
  districtName: 'Quận Ba Đình',
  wardName: 'Phường Điện Biên',
  street: '1 Điện Biên Phủ',
  isDefault: true,
};
