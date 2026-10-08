import { Body, Controller, Get, INestApplication, Injectable, Post, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsEmail, IsString, MinLength, ValidateNested } from 'class-validator';
import jwt from 'jsonwebtoken';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import request from 'supertest';
import { CurrentUser, Public, RequirePermissions } from './auth/decorators';
import { AuthUser, generateDevPrivateKey, keyId, signAccessToken } from './auth/jwt';
import { PageQuery, toPage } from './db/pagination';
import { AppError } from './errors/app-error';
import { SanCommonModule } from './san-common.module';
import { setupApp } from './setup-app';

class AddressDto {
  @IsString()
  @MinLength(2, { message: 'Tên đường quá ngắn.' })
  street!: string;
}

class SignUpDto {
  @IsEmail({}, { message: 'Email không hợp lệ.' })
  email!: string;

  @ValidateNested()
  @Type(() => AddressDto)
  address!: AddressDto;
}

@Controller('demo')
class DemoController {
  @Public()
  @Get('public')
  open(@CurrentUser() user?: AuthUser) {
    return { user: user?.id ?? null };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @RequirePermissions('MODERATION', 'SYSTEM')
  @Get('admin')
  admin() {
    return { ok: true };
  }

  @Public()
  @Post('sign-up')
  signUp(@Body() dto: SignUpDto) {
    return dto;
  }

  @Public()
  @Get('items')
  items(@Query() q: PageQuery) {
    return toPage(['a'], 41, q);
  }

  @Public()
  @Get('conflict')
  conflict() {
    throw new AppError(409, 'SHOP_NAME_TAKEN', 'Tên shop đã có người dùng.', { field: 'name' });
  }

  @Public()
  @Get('boom')
  boom() {
    throw new Error('lỗi bí mật trong code');
  }
}

/** Gói chung chỉ cần PrismaService khi gửi/nhận sự kiện; test này không dùng tới */
@Injectable()
class FakePrisma {}

const PEM = generateDevPrivateKey();
const KEY = createPrivateKey(PEM);
const buyer: AuthUser = { id: 'u-1', email: 'a@b.vn', name: 'An', permissions: [] };
const moderator: AuthUser = { ...buyer, id: 'u-2', permissions: ['MODERATION'] };

describe('Nền tảng chung trong một app NestJS', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        SanCommonModule.forRoot({
          service: 'user-service',
          prisma: FakePrisma,
          jwtPrivateKey: PEM,
        }),
      ],
      controllers: [DemoController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    setupApp(app, { apiPrefix: 'api/test/v1', title: 'test', description: 'test' });
    await app.init();
  });

  afterAll(() => app.close());

  describe('đăng nhập và bộ quyền', () => {
    it('API công khai không cần vé, vé hỏng vẫn cho qua', async () => {
      await http().get('/api/test/v1/demo/public').expect(200, { user: null });
      await http()
        .get('/api/test/v1/demo/public')
        .set('Authorization', 'Bearer rac')
        .expect(200, { user: null });
    });

    it('API công khai vẫn biết người gọi nếu có vé', async () => {
      await http()
        .get('/api/test/v1/demo/public')
        .set('Authorization', `Bearer ${signAccessToken(buyer, KEY)}`)
        .expect(200, { user: 'u-1' });
    });

    it('không có vé thì 401 UNAUTHENTICATED', async () => {
      const res = await http().get('/api/test/v1/demo/me').expect(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: 'Bạn cần đăng nhập.' });
    });

    it('vé đúng thì lấy được người gọi', async () => {
      await http()
        .get('/api/test/v1/demo/me')
        .set('Authorization', `Bearer ${signAccessToken(buyer, KEY)}`)
        .expect(200, buyer);
    });

    it('vé hết hạn thì 401 TOKEN_EXPIRED', async () => {
      const expired = jwt.sign({ email: 'a@b.vn', name: 'An', perms: [] }, KEY, {
        algorithm: 'RS256',
        keyid: keyId(createPublicKey(KEY)),
        issuer: 'user-service',
        audience: 'san',
        subject: 'u-1',
        expiresIn: -10,
      });
      const res = await http()
        .get('/api/test/v1/demo/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
      expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    it('vé ký bằng khóa khác thì 401', async () => {
      const other = createPrivateKey(generateDevPrivateKey());
      const res = await http()
        .get('/api/test/v1/demo/me')
        .set('Authorization', `Bearer ${signAccessToken(buyer, other)}`)
        .expect(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('thiếu bộ quyền thì 403, có một trong các bộ quyền thì qua', async () => {
      const res = await http()
        .get('/api/test/v1/demo/admin')
        .set('Authorization', `Bearer ${signAccessToken(buyer, KEY)}`)
        .expect(403);
      expect(res.body.code).toBe('FORBIDDEN');
      await http()
        .get('/api/test/v1/demo/admin')
        .set('Authorization', `Bearer ${signAccessToken(moderator, KEY)}`)
        .expect(200);
    });
  });

  describe('dạng lỗi chung', () => {
    it('dữ liệu sai thì 400 kèm lỗi từng trường, cả trường lồng nhau', async () => {
      const res = await http()
        .post('/api/test/v1/demo/sign-up')
        .send({ email: 'sai', address: { street: 'a' } })
        .expect(400);
      expect(res.body).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Dữ liệu chưa hợp lệ.',
        details: {
          fields: { email: 'Email không hợp lệ.', 'address.street': 'Tên đường quá ngắn.' },
        },
      });
    });

    it('bỏ trường lạ không khai trong DTO', async () => {
      const res = await http()
        .post('/api/test/v1/demo/sign-up')
        .send({ email: 'a@b.vn', address: { street: 'Lê Lợi' }, isAdmin: true })
        .expect(201);
      expect(res.body).toEqual({ email: 'a@b.vn', address: { street: 'Lê Lợi' } });
    });

    it('lỗi nghiệp vụ giữ mã và chi tiết riêng', async () => {
      await http()
        .get('/api/test/v1/demo/conflict')
        .expect(409, {
          code: 'SHOP_NAME_TAKEN',
          message: 'Tên shop đã có người dùng.',
          details: { field: 'name' },
        });
    });

    it('lỗi bất ngờ thì 500, không lộ chi tiết trong code', async () => {
      await http().get('/api/test/v1/demo/boom').expect(500, {
        code: 'INTERNAL_ERROR',
        message: 'Có lỗi hệ thống, vui lòng thử lại sau.',
      });
    });

    it('đường dẫn không có thì 404 NOT_FOUND', async () => {
      const res = await http().get('/api/test/v1/khong-co').expect(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('phân trang', () => {
    it('mặc định trang 1, 20 dòng', async () => {
      await http()
        .get('/api/test/v1/demo/items')
        .expect(200, { items: ['a'], page: 1, pageSize: 20, total: 41 });
    });

    it('đọc số từ query', async () => {
      const res = await http().get('/api/test/v1/demo/items?page=3&pageSize=5').expect(200);
      expect(res.body).toMatchObject({ page: 3, pageSize: 5 });
    });

    it('pageSize quá 100 thì 400', async () => {
      const res = await http().get('/api/test/v1/demo/items?pageSize=101').expect(400);
      expect(res.body.details.fields).toEqual({ pageSize: 'pageSize lớn nhất là 100.' });
    });
  });

  describe('mã lần vết và tài liệu API', () => {
    it('giữ X-Correlation-Id gửi lên, không có thì sinh mới', async () => {
      const res = await http().get('/health').set('X-Correlation-Id', 'abc-123');
      expect(res.headers['x-correlation-id']).toBe('abc-123');
      const res2 = await http().get('/api/test/v1/demo/public');
      expect(res2.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('có tài liệu OpenAPI ở /<tiền tố>/docs-json', async () => {
      const res = await http().get('/api/test/v1/docs-json').expect(200);
      expect(Object.keys(res.body.paths)).toContain('/api/test/v1/demo/items');
    });
  });
});
