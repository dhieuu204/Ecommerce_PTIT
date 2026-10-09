import { API, createTestApp, makeUser, type TestApp } from './helpers';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(100),
]);

// Không cần database: kho ảnh là bản giả
describe('Tải logo shop (SHP-01)', () => {
  let t: TestApp;
  const user = makeUser();

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.app.close());

  const upload = (buf: Buffer, name = 'logo.png') =>
    t
      .http()
      .post(`${API}/uploads/shop-logo`)
      .set('Authorization', `Bearer ${user.token}`)
      .attach('file', buf, name);

  it('cần đăng nhập', async () => {
    await t.http().post(`${API}/uploads/shop-logo`).attach('file', PNG, 'a.png').expect(401);
  });

  it('ảnh PNG hợp lệ → lưu vào thư mục của người tải, trả đường dẫn', async () => {
    const res = await upload(PNG).expect(201);
    expect(res.body.url).toMatch(
      new RegExp(`^http://localhost:9000/san-public/shop-logos/${user.id}/[0-9a-f-]{36}\\.png$`),
    );
    expect(t.storage.files.size).toBe(1);
  });

  it('nhận diện loại ảnh theo nội dung, không theo đuôi file', async () => {
    const res = await upload(Buffer.from('<svg></svg>'), 'logo.png').expect(400);
    expect(res.body.code).toBe('INVALID_IMAGE');
    const webp = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.alloc(4),
      Buffer.from('WEBP'),
      Buffer.alloc(20),
    ]);
    expect((await upload(webp, 'a.bin').expect(201)).body.url).toMatch(/\.webp$/);
  });

  it('quá 2 MB → FILE_TOO_LARGE; không gửi file → FILE_REQUIRED', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    expect((await upload(big).expect(400)).body.code).toBe('FILE_TOO_LARGE');
    const res = await t
      .http()
      .post(`${API}/uploads/shop-logo`)
      .set('Authorization', `Bearer ${user.token}`)
      .expect(400);
    expect(res.body.code).toBe('FILE_REQUIRED');
  });

  it('MinIO lỗi → 503 STORAGE_UNAVAILABLE', async () => {
    t.storage.fail = true;
    expect((await upload(PNG).expect(503)).body.code).toBe('STORAGE_UNAVAILABLE');
    t.storage.fail = false;
  });
});
