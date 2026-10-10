import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import type { ErrorBody } from '@san/shared';
import { AppConfig } from '../config';

/** Lần thanh toán payment-service vừa tạo (hoặc mở lại) */
export interface PaymentLink {
  paymentId: string;
  attempt: number;
  maxAttempts: number;
  /** Đường dẫn chuyển buyer sang VNPay (hoặc trang MÔ PHỎNG) */
  payUrl: string;
  gateway: 'VNPAY' | 'MOCK';
}

/**
 * Gọi payment-service tạo lần thanh toán (sơ đồ ARCH-01: M → P "tạo link trả"), chuyển kèm vé của buyer.
 * Số tiền payment-service tự lấy từ bản chép đơn nhận qua sự kiện order.placed, không nhận từ đây.
 */
@Injectable()
export class PaymentClient {
  private readonly logger = new Logger(PaymentClient.name);

  constructor(private readonly config: AppConfig) {}

  async createPayment(
    authorization: string,
    idempotencyKey: string,
    body: { orderId: string; clientIp?: string },
  ): Promise<PaymentLink> {
    let res: Response;
    try {
      res = await fetch(`${this.config.paymentApiUrl}/payments`, {
        method: 'POST',
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      this.logger.error(`Không gọi được payment-service: ${(e as Error).message}`);
      throw unavailable();
    }
    if (res.ok) return (await res.json()) as PaymentLink;
    // Lỗi nghiệp vụ của payment-service (409 PAYMENT_UNKNOWN...) chuyển nguyên cho web
    if (res.status >= 400 && res.status < 500) {
      const err = (await res.json().catch(() => null)) as ErrorBody | null;
      if (err?.code) throw new AppError(res.status, err.code, err.message, err.details);
    }
    this.logger.error(`payment-service trả HTTP ${res.status}`);
    throw unavailable();
  }
}

function unavailable(): AppError {
  return new AppError(
    503,
    'PAYMENT_SERVICE_UNAVAILABLE',
    'Chưa tạo được lần thanh toán, bạn thử lại sau ít phút.',
  );
}
