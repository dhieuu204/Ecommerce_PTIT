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

/** Cấu hình payment-service đọc từ .env (danh sách ở .env.example). Khóa bí mật không ghi ra log. */
@Injectable()
export class AppConfig {
  /** Mã website (TMN) VNPay sandbox. Trống cùng khóa bí mật → chạy cổng MÔ PHỎNG */
  readonly vnpayTmnCode = text('VNPAY_TMN_CODE');
  /** Khóa bí mật ký dữ liệu VNPay (vnp_HashSecret). Bí mật: chỉ để trong .env */
  readonly vnpayHashSecret = text('VNPAY_HASH_SECRET');
  readonly vnpayPayUrl = text(
    'VNPAY_PAY_URL',
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  );
  /** API tra cứu và hoàn tiền */
  readonly vnpayApiUrl = text(
    'VNPAY_API_URL',
    'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
  );
  /** Web của sàn: VNPay đưa buyer về `${webUrl}/thanh-toan/ket-qua` */
  readonly webUrl = text('WEB_URL', 'http://localhost:5173');
  /** Cổng mô phỏng: kết quả lệnh hoàn (SUCCEEDED, FAILED, UNKNOWN) để thử luồng hoàn tay */
  readonly mockRefundResult = text('MOCK_REFUND_RESULT', 'SUCCEEDED') as
    'SUCCEEDED' | 'FAILED' | 'UNKNOWN';

  /** MinIO: ảnh biên lai hoàn tay (bucket riêng tư) */
  readonly minioEndpoint = text('MINIO_ENDPOINT', 'localhost');
  readonly minioPort = num('MINIO_PORT', 9000);
  readonly minioUseSsl = process.env.MINIO_USE_SSL === 'true';
  readonly minioAccessKey = text('MINIO_ACCESS_KEY', 'minio');
  readonly minioSecretKey = text('MINIO_SECRET_KEY', 'minio12345');
  readonly privateBucket = text('MINIO_PRIVATE_BUCKET', 'san-private');
  /** Ảnh biên lai tối đa (MB) */
  readonly receiptMaxMb = num('RECEIPT_MAX_MB', 5);

  get vnpayConfigured(): boolean {
    return Boolean(this.vnpayTmnCode && this.vnpayHashSecret);
  }
}
