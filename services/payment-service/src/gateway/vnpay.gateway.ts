import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config';
import type { Payment } from '../../generated/prisma';
import type { GatewayCallback, GatewayQuery, GatewayRefund, PaymentGateway } from './gateway';
import { hmac512, parseVnpDate, signedQuery, verifySignature, vnpDate } from './vnpay-sign';

const VERSION = '2.1.0';

/** Mã yêu cầu tra cứu/hoàn: VNPay cho tối đa 32 ký tự, không trùng */
const requestId = () => randomUUID().replace(/-/g, '');

/**
 * VNPay sandbox (PAY-01..03, REF-01). Ký mọi yêu cầu bằng HMAC-SHA512, kiểm chữ ký mọi tin VNPay gửi về.
 * Khóa bí mật không ghi ra log và không lưu vào database.
 */
export class VnpayGateway implements PaymentGateway {
  readonly kind = 'VNPAY' as const;
  private readonly logger = new Logger('VNPay');

  constructor(private readonly config: AppConfig) {}

  payUrl(payment: Payment, orderCode: string, expireAt: Date): string {
    const params: Record<string, string> = {
      vnp_Version: VERSION,
      vnp_Command: 'pay',
      vnp_TmnCode: this.config.vnpayTmnCode,
      vnp_Amount: String(payment.amount * 100),
      vnp_CurrCode: 'VND',
      vnp_TxnRef: payment.ref,
      vnp_OrderInfo: `Thanh toan don ${orderCode}`,
      vnp_OrderType: 'other',
      vnp_Locale: 'vn',
      vnp_ReturnUrl: `${this.config.webUrl}/thanh-toan/ket-qua`,
      vnp_IpAddr: payment.clientIp,
      vnp_CreateDate: vnpDate(payment.createdAt),
      vnp_ExpireDate: vnpDate(expireAt),
    };
    return `${this.config.vnpayPayUrl}?${signedQuery(params, this.config.vnpayHashSecret)}`;
  }

  parseCallback(params: Record<string, string>): GatewayCallback {
    const valid = verifySignature(params, this.config.vnpayHashSecret);
    const code = params.vnp_ResponseCode ?? null;
    const status = params.vnp_TransactionStatus ?? null;
    const amount = Number(params.vnp_Amount);
    const raw: Record<string, unknown> = { ...params };
    delete raw.vnp_SecureHash;
    return {
      valid,
      ref: params.vnp_TxnRef ?? '',
      amount: Number.isFinite(amount) ? amount / 100 : null,
      success: code === '00' && (status === null || status === '00'),
      responseCode: code,
      transactionNo: params.vnp_TransactionNo ?? null,
      bankCode: params.vnp_BankCode ?? null,
      paidAt: parseVnpDate(params.vnp_PayDate),
      raw,
    };
  }

  async query(payment: Payment): Promise<GatewayQuery> {
    const body = this.signed(
      {
        vnp_RequestId: requestId(),
        vnp_Version: VERSION,
        vnp_Command: 'querydr',
        vnp_TmnCode: this.config.vnpayTmnCode,
        vnp_TxnRef: payment.ref,
        vnp_OrderInfo: `Tra cuu ${payment.ref}`,
        vnp_TransactionDate: vnpDate(payment.createdAt),
        vnp_CreateDate: vnpDate(new Date()),
        vnp_IpAddr: payment.clientIp,
      },
      [
        'vnp_RequestId',
        'vnp_Version',
        'vnp_Command',
        'vnp_TmnCode',
        'vnp_TxnRef',
        'vnp_TransactionDate',
        'vnp_CreateDate',
        'vnp_IpAddr',
        'vnp_OrderInfo',
      ],
    );
    const res = await this.post(body);
    const code = String(res.vnp_ResponseCode ?? '');
    const status = String(res.vnp_TransactionStatus ?? '');
    const amount = Number(res.vnp_Amount);
    const base = {
      amount: Number.isFinite(amount) ? amount / 100 : null,
      transactionNo: (res.vnp_TransactionNo as string | undefined) ?? null,
      bankCode: (res.vnp_BankCode as string | undefined) ?? null,
      paidAt: parseVnpDate(res.vnp_PayDate as string | undefined),
      raw: res,
    };
    // 91: không có giao dịch (buyer chưa trả / đã bỏ) → coi như thất bại
    if (code === '91') return { status: 'FAILED', ...base };
    if (code !== '00') throw new Error(`VNPay tra cứu trả mã ${code}`);
    if (status === '00') return { status: 'SUCCEEDED', ...base };
    if (status === '01') return { status: 'PENDING', ...base };
    return { status: 'FAILED', ...base };
  }

  async refund(payment: Payment, amount: number, id: string): Promise<GatewayRefund> {
    const body = this.signed(
      {
        vnp_RequestId: id,
        vnp_Version: VERSION,
        vnp_Command: 'refund',
        vnp_TmnCode: this.config.vnpayTmnCode,
        // 02: hoàn toàn phần, 03: hoàn một phần
        vnp_TransactionType: amount >= payment.amount ? '02' : '03',
        vnp_TxnRef: payment.ref,
        vnp_Amount: String(amount * 100),
        vnp_TransactionNo: payment.transactionNo ?? '0',
        vnp_TransactionDate: vnpDate(payment.createdAt),
        vnp_CreateBy: 'payment-service',
        vnp_CreateDate: vnpDate(new Date()),
        vnp_IpAddr: payment.clientIp,
        vnp_OrderInfo: `Hoan tien ${payment.ref}`,
      },
      [
        'vnp_RequestId',
        'vnp_Version',
        'vnp_Command',
        'vnp_TmnCode',
        'vnp_TransactionType',
        'vnp_TxnRef',
        'vnp_Amount',
        'vnp_TransactionNo',
        'vnp_TransactionDate',
        'vnp_CreateBy',
        'vnp_CreateDate',
        'vnp_IpAddr',
        'vnp_OrderInfo',
      ],
    );
    let res: Record<string, unknown>;
    try {
      res = await this.post(body);
    } catch (e) {
      // Không biết VNPay đã nhận lệnh chưa: ghi "không rõ" để tra cứu, không gửi lại
      return { status: 'UNKNOWN', message: (e as Error).message, raw: {} };
    }
    const code = String(res.vnp_ResponseCode ?? '');
    if (code === '00') return { status: 'SUCCEEDED', message: null, raw: res };
    return {
      status: 'FAILED',
      message: `VNPay từ chối hoàn (mã ${code}): ${String(res.vnp_Message ?? '')}`,
      raw: res,
    };
  }

  async queryRefund(payment: Payment): Promise<'SUCCEEDED' | 'NOT_FOUND' | 'UNKNOWN'> {
    try {
      const q = await this.query(payment);
      const type = String(q.raw.vnp_TransactionType ?? '');
      const status = String(q.raw.vnp_TransactionStatus ?? '');
      // 02/03: giao dịch đã hoàn toàn phần/một phần; 05/06: VNPay đang xử lý/đã gửi hoàn sang ngân hàng
      if (['02', '03'].includes(type) || ['05', '06'].includes(status)) return 'SUCCEEDED';
      if (q.status === 'SUCCEEDED') return 'NOT_FOUND';
      return 'UNKNOWN';
    } catch {
      return 'UNKNOWN';
    }
  }

  // ----- phần dùng chung -----

  /** Gắn chữ ký: các trường theo thứ tự VNPay quy định, nối bằng `|` */
  private signed(body: Record<string, string>, order: string[]): Record<string, string> {
    const data = order.map((k) => body[k] ?? '').join('|');
    return { ...body, vnp_SecureHash: hmac512(this.config.vnpayHashSecret, data) };
  }

  private async post(body: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(this.config.vnpayApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`VNPay trả HTTP ${res.status}`);
    const json = (await res.json()) as Record<string, unknown>;
    this.logger.log(
      `${body.vnp_Command} ${body.vnp_TxnRef}: mã ${String(json.vnp_ResponseCode)} ${String(json.vnp_Message ?? '')}`,
    );
    return json;
  }
}
