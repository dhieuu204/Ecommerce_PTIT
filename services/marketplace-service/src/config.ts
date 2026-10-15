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
  /** Bucket riêng tư (ảnh bằng chứng trả hàng): chỉ xem qua API có kiểm quyền */
  readonly privateBucket = text('MINIO_PRIVATE_BUCKET', 'san-market-private');
  /** Địa chỉ trình duyệt mở ảnh, ví dụ http://localhost:9000 */
  readonly publicFileUrl = text('PUBLIC_FILE_URL', 'http://localhost:9000');

  /** Logo shop tối đa (MB) */
  readonly logoMaxMb = num('SHOP_LOGO_MAX_MB', 2);

  /** Giỏ hàng tối đa bao nhiêu dòng (CRT-01) */
  readonly cartMaxItems = num('CART_MAX_ITEMS', 100);
  /** Voucher dài tối đa bao nhiêu ngày (VCH-01) */
  readonly voucherMaxDays = num('VOUCHER_MAX_DAYS', 180);
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

  // ----- P3: đặt hàng -----
  /** Mã shop trên GHN dev (header ShopId khi tính phí); để trống vẫn tính được theo quận/huyện */
  readonly ghnShopId = text('GHN_SHOP_ID');
  /** user-service: lấy sổ địa chỉ của buyer khi checkout */
  readonly userApiUrl = text('USER_API_URL', 'http://localhost:3001/api/user/v1');
  /** payment-service: tạo lần thanh toán */
  readonly paymentApiUrl = text('PAYMENT_API_URL', 'http://localhost:3003/api/payment/v1');
  /** Bản xem trước checkout dùng được trong bao nhiêu phút (kỹ thuật, không phải luật nghiệp vụ) */
  readonly checkoutPreviewMinutes = num('CHECKOUT_PREVIEW_MINUTES', 30);

  // ----- P4: giao hàng -----
  /** Mã bí mật trong đường dẫn webhook GHN (GHN không ký dữ liệu). Bí mật: chỉ để trong .env */
  readonly ghnWebhookToken = text('GHN_WEBHOOK_TOKEN');
  /** Kích thước kiện mặc định gửi GHN (cm) */
  readonly packageLengthCm = num('PACKAGE_LENGTH_CM', 20);
  readonly packageWidthCm = num('PACKAGE_WIDTH_CM', 15);
  readonly packageHeightCm = num('PACKAGE_HEIGHT_CM', 10);

  // ----- P5: trả hàng -----
  /** Ảnh bằng chứng trả hàng/khiếu nại tối đa (MB) và số ảnh mỗi lần gửi */
  readonly returnImageMaxMb = num('RETURN_IMAGE_MAX_MB', 5);
  readonly returnMaxImages = num('RETURN_MAX_IMAGES', 6);
}
