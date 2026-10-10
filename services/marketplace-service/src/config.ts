import { Injectable } from '@nestjs/common';

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Biến môi trường ${name} phải là số dương, đang là "${raw}"`);
  }
  return value;
}

function text(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

/** Cấu hình marketplace-service đọc từ .env (danh sách ở .env.example). */
@Injectable()
export class AppConfig {
  /** Token GHN môi trường dev. Để trống: dùng danh sách tỉnh/huyện/xã mẫu (mô phỏng) */
  readonly ghnToken = text('GHN_TOKEN');
  readonly ghnApiUrl = text('GHN_API_URL', 'https://dev-online-gateway.ghn.vn/shiip/public-api');

  /** MinIO (lưu ảnh). Mặc định khớp infra/docker-compose.yml */
  readonly minioEndpoint = text('MINIO_ENDPOINT', 'localhost');
  readonly minioPort = num('MINIO_PORT', 9000);
  readonly minioUseSsl = process.env.MINIO_USE_SSL === 'true';
  readonly minioAccessKey = text('MINIO_ACCESS_KEY', 'minio');
  readonly minioSecretKey = text('MINIO_SECRET_KEY', 'minio12345');
  /** Bucket ảnh công khai (logo, ảnh sản phẩm); ai có đường dẫn cũng xem được */
  readonly publicBucket = text('MINIO_PUBLIC_BUCKET', 'san-public');
  /** Địa chỉ trình duyệt mở ảnh, ví dụ http://localhost:9000 */
  readonly publicFileUrl = text('PUBLIC_FILE_URL', 'http://localhost:9000');

  /** Logo shop tối đa (MB) */
  readonly logoMaxMb = num('SHOP_LOGO_MAX_MB', 2);

  // ----- Con số cấu hình P2: sản phẩm (CAT-02, CAT-03, INV-01) -----
  /** Ảnh sản phẩm tối đa (MB) */
  readonly productImageMaxMb = num('PRODUCT_IMAGE_MAX_MB', 5);
  /** Số ảnh chung tối đa của một sản phẩm (chưa kể ảnh theo lựa chọn nhóm 1) */
  readonly productMaxImages = num('PRODUCT_MAX_IMAGES', 9);
  /** Số lựa chọn tối đa trong mỗi nhóm phân loại (tối đa 2 nhóm) */
  readonly variantMaxOptions = num('VARIANT_MAX_OPTIONS', 10);
  /** Giá bán thấp nhất / cao nhất của một biến thể (đồng) */
  readonly priceMin = num('PRICE_MIN', 1000);
  readonly priceMax = num('PRICE_MAX', 500000000);
  /** Khối lượng đóng gói tối đa (gram) */
  readonly weightMaxGrams = num('WEIGHT_MAX_GRAMS', 30000);
  /** Tồn kho tối đa của một biến thể */
  readonly stockMax = num('STOCK_MAX', 999999);
}
