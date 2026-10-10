import type { Payment } from '../../generated/prisma';

/** Kết quả cổng báo về (IPN, đường dẫn quay về) sau khi đã kiểm chữ ký */
export interface GatewayCallback {
  /** Chữ ký hợp lệ */
  valid: boolean;
  /** vnp_TxnRef */
  ref: string;
  /** Số tiền (đồng) cổng báo */
  amount: number | null;
  /** true: cổng báo trả thành công; false: thất bại/buyer hủy; null: chưa biết (cổng mô phỏng) */
  success: boolean | null;
  responseCode: string | null;
  transactionNo: string | null;
  bankCode: string | null;
  paidAt: Date | null;
  /** Dữ liệu gốc để lưu vết (không có khóa bí mật) */
  raw: Record<string, unknown>;
}

/** Kết quả tra cứu một giao dịch thanh toán */
export interface GatewayQuery {
  /** SUCCEEDED: đã trả; FAILED: thất bại/không có giao dịch; PENDING: cổng chưa có kết quả */
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  amount: number | null;
  transactionNo: string | null;
  bankCode: string | null;
  paidAt: Date | null;
  raw: Record<string, unknown>;
}

/** Kết quả gửi lệnh hoàn: UNKNOWN = timeout/không phản hồi, phải tra cứu chứ không gửi lại */
export interface GatewayRefund {
  status: 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
  message: string | null;
  raw: Record<string, unknown>;
}

/**
 * Lớp adapter cổng thanh toán (quyết định MAP-01 số 3): VNPay sandbox khi có khóa, MÔ PHỎNG khi chưa có.
 * Đổi cổng không phải sửa nghiệp vụ.
 */
export interface PaymentGateway {
  readonly kind: 'VNPAY' | 'MOCK';
  /** Đường dẫn đưa buyer đi trả tiền. `payment.createdAt` là thời điểm tạo giao dịch gửi cho cổng */
  payUrl(payment: Payment, orderCode: string, expireAt: Date): string;
  /** Đọc và kiểm chữ ký các tham số cổng gửi về (IPN hoặc đường dẫn quay về) */
  parseCallback(params: Record<string, string>): GatewayCallback;
  /** Tra cứu kết quả thanh toán. Lỗi mạng/không phản hồi thì ném lỗi (người gọi ghi "không rõ") */
  query(payment: Payment): Promise<GatewayQuery>;
  /** Gửi lệnh hoàn `amount` đồng từ giao dịch đã thu */
  refund(payment: Payment, amount: number, requestId: string): Promise<GatewayRefund>;
  /**
   * Tra cứu một lệnh hoàn chưa rõ kết quả: SUCCEEDED (cổng đã hoàn), NOT_FOUND (chưa hoàn → được gửi lại),
   * UNKNOWN (vẫn chưa biết)
   */
  queryRefund(payment: Payment): Promise<'SUCCEEDED' | 'NOT_FOUND' | 'UNKNOWN'>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
