import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppError, type AuthUser } from '@san/nest-common';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../gateway/gateway';
import { mockBank, type MockBankResult } from '../gateway/mock.gateway';
import { PrismaService } from '../prisma.service';
import type { Prisma } from '../../generated/prisma';
import { PaymentsService, type OrderPaymentView } from './payments.service';

/** Trả lời IPN theo tài liệu VNPay */
export interface IpnReply {
  RspCode: '00' | '01' | '02' | '04' | '97' | '99';
  Message: string;
}

/**
 * Nhận kết quả từ cổng (PAY-02, PAY-03): IPN VNPay gọi thẳng vào sàn, đường dẫn buyer quay về sau khi trả,
 * và trang MÔ PHỎNG. Không tin trang web: đường dẫn quay về báo thành công thì vẫn tra cứu cổng trước khi ghi.
 */
@Injectable()
export class CallbacksService {
  private readonly logger = new Logger(CallbacksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** IPN: kiểm chữ ký, mã giao dịch, số tiền rồi mới ghi; gửi trùng trả 02 */
  async ipn(params: Record<string, string>): Promise<IpnReply> {
    try {
      const cb = this.gateway.parseCallback(params);
      if (!cb.valid || this.gateway.kind !== 'VNPAY') {
        this.logger.warn(`IPN sai chữ ký (${cb.ref || 'không có mã'}), bỏ qua.`);
        return { RspCode: '97', Message: 'Invalid signature' };
      }
      const p = await this.prisma.payment.findUnique({ where: { ref: cb.ref } });
      if (!p) return { RspCode: '01', Message: 'Order not found' };
      if (cb.amount !== p.amount) return { RspCode: '04', Message: 'Invalid amount' };
      if (p.status === 'SUCCEEDED' || p.status === 'FAILED') {
        return { RspCode: '02', Message: 'Order already confirmed' };
      }
      await this.prisma.$transaction((tx) =>
        this.payments.apply(tx, p.id, {
          success: cb.success === true,
          amount: cb.amount,
          transactionNo: cb.transactionNo,
          bankCode: cb.bankCode,
          paidAt: cb.paidAt,
          raw: { ipn: cb.raw },
        }),
      );
      return { RspCode: '00', Message: 'Confirm Success' };
    } catch (e) {
      this.logger.error(`IPN lỗi: ${(e as Error).message}`);
      return { RspCode: '99', Message: 'Unknown error' };
    }
  }

  /**
   * Buyer quay về từ cổng: kiểm chữ ký; cổng báo thành công (hoặc cổng mô phỏng) thì tra cứu rồi mới ghi;
   * buyer hủy/thanh toán lỗi thì lần đó thất bại. Trả tình hình thanh toán của đơn.
   */
  async returned(buyer: AuthUser, params: Record<string, string>): Promise<OrderPaymentView> {
    const cb = this.gateway.parseCallback(params);
    if (!cb.valid) {
      throw new AppError(400, 'INVALID_SIGNATURE', 'Dữ liệu cổng thanh toán gửi về không hợp lệ.');
    }
    const p = await this.prisma.payment.findUnique({ where: { ref: cb.ref } });
    const owner =
      p && (await this.prisma.sellerEarning.findFirst({ where: { orderId: p.orderId } }));
    if (!p || owner?.buyerId !== buyer.id) {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy lần thanh toán.');
    }
    if (p.status === 'PENDING' || p.status === 'UNKNOWN') {
      if (cb.success === false) {
        await this.prisma.$transaction((tx) =>
          this.payments.apply(tx, p.id, {
            success: false,
            amount: cb.amount,
            transactionNo: cb.transactionNo,
            bankCode: cb.bankCode,
            paidAt: null,
            raw: { return: cb.raw },
          }),
        );
      } else {
        await this.payments.check(p);
      }
    }
    return this.payments.orderPayment(buyer, p.orderId);
  }

  // ----- cổng MÔ PHỎNG -----

  async mockInfo(ref: string): Promise<{
    ref: string;
    orderCode: string;
    amount: number;
    status: string;
    payBefore: Date;
  }> {
    const p = await this.mockPayment(ref);
    const rows = await this.prisma.sellerEarning.findMany({ where: { orderId: p.orderId } });
    return {
      ref: p.ref,
      orderCode: rows[0]?.orderCode ?? '',
      amount: p.amount,
      status: p.status,
      payBefore: rows[0]?.payBefore ?? p.createdAt,
    };
  }

  /**
   * Buyer chọn kết quả trên trang mô phỏng. SUCCESS/FAILED: như VNPay báo IPN ngay. PAID_NO_NOTICE: "ngân
   * hàng" đã trừ tiền nhưng tin báo bị mất; sàn chỉ biết khi tra cứu (lúc buyer quay về hoặc job).
   */
  async mockComplete(
    ref: string,
    result: 'SUCCESS' | 'FAILED' | 'PAID_NO_NOTICE',
  ): Promise<{ returnUrl: string }> {
    const p = await this.mockPayment(ref);
    if (p.status !== 'PENDING' || mockBank(p)) {
      throw new AppError(409, 'PAYMENT_DONE', 'Lần thanh toán này đã có kết quả.');
    }
    const bank: MockBankResult = result === 'FAILED' ? 'FAILED' : 'PAID';
    await this.prisma.payment.update({
      where: { id: p.id },
      data: {
        gatewayResponse: { mockBank: bank } as Prisma.InputJsonValue,
      },
    });
    this.logger.log(`MÔ PHỎNG: buyer chọn ${result} cho ${ref}`);
    if (result !== 'PAID_NO_NOTICE') {
      await this.prisma.$transaction((tx) =>
        this.payments.apply(tx, p.id, {
          success: result === 'SUCCESS',
          amount: p.amount,
          transactionNo: result === 'SUCCESS' ? `MOCK${p.ref}` : null,
          bankCode: 'MOCKBANK',
          paidAt: new Date(),
          raw: { mockIpn: result },
        }),
      );
    }
    return { returnUrl: `/thanh-toan/ket-qua?vnp_TxnRef=${encodeURIComponent(p.ref)}` };
  }

  private async mockPayment(ref: string) {
    if (this.gateway.kind !== 'MOCK') {
      throw new AppError(404, 'NOT_FOUND', 'Cổng mô phỏng không bật.');
    }
    const p = await this.prisma.payment.findUnique({ where: { ref } });
    if (!p) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy lần thanh toán.');
    return p;
  }
}
