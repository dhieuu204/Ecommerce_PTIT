import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import type { Payment } from '../../generated/prisma';
import type { GatewayCallback, GatewayQuery, GatewayRefund, PaymentGateway } from './gateway';

/** "Phía ngân hàng" của cổng mô phỏng, lưu trong payments.gateway_response.mockBank */
export type MockBankResult = 'PAID' | 'FAILED';

export function mockBank(payment: Payment): MockBankResult | null {
  const r = payment.gatewayResponse as { mockBank?: MockBankResult } | null;
  return r?.mockBank ?? null;
}

/**
 * Cổng thanh toán MÔ PHỎNG (khi chưa có khóa VNPay). Trang /thanh-toan/mo-phong của web cho buyer chọn
 * Thành công / Thất bại / Trả tiền nhưng mất tin báo. Mọi log ghi "MÔ PHỎNG". Không có tiền thật.
 */
export class MockGateway implements PaymentGateway {
  readonly kind = 'MOCK' as const;
  private readonly logger = new Logger('Cổng MÔ PHỎNG');

  constructor(private readonly config: AppConfig) {}

  payUrl(payment: Payment): string {
    return `${this.config.webUrl}/thanh-toan/mo-phong?ref=${encodeURIComponent(payment.ref)}`;
  }

  /** Đường dẫn quay về của cổng mô phỏng chỉ mang mã giao dịch; kết quả lấy bằng tra cứu */
  parseCallback(params: Record<string, string>): GatewayCallback {
    return {
      valid: Boolean(params.vnp_TxnRef),
      ref: params.vnp_TxnRef ?? '',
      amount: null,
      success: null,
      responseCode: null,
      transactionNo: null,
      bankCode: null,
      paidAt: null,
      raw: { mock: true },
    };
  }

  async query(payment: Payment): Promise<GatewayQuery> {
    const bank = mockBank(payment);
    const paid = bank === 'PAID';
    this.logger.log(`MÔ PHỎNG tra cứu ${payment.ref}: ${bank ?? 'chưa trả'}`);
    return {
      status: paid ? 'SUCCEEDED' : 'FAILED',
      amount: paid ? payment.amount : null,
      transactionNo: paid ? `MOCK${payment.ref}` : null,
      bankCode: paid ? 'MOCKBANK' : null,
      paidAt: paid ? new Date() : null,
      raw: { mock: true, bank },
    };
  }

  async refund(payment: Payment, amount: number, requestId: string): Promise<GatewayRefund> {
    const status = this.config.mockRefundResult;
    this.logger.log(`MÔ PHỎNG hoàn ${amount}đ từ ${payment.ref} (lệnh ${requestId}): ${status}`);
    return {
      status,
      message:
        status === 'FAILED' ? 'Cổng MÔ PHỎNG từ chối hoàn (MOCK_REFUND_RESULT=FAILED).' : null,
      raw: { mock: true, requestId },
    };
  }

  async queryRefund(): Promise<'SUCCEEDED' | 'NOT_FOUND' | 'UNKNOWN'> {
    return this.config.mockRefundResult === 'SUCCEEDED' ? 'SUCCEEDED' : 'NOT_FOUND';
  }
}
