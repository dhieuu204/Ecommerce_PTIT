import type { AppConfig } from '../config';
import type { Payment } from '../../generated/prisma';
import { VnpayGateway } from './vnpay.gateway';

const config = {
  vnpayTmnCode: 'TESTTMN1',
  vnpayHashSecret: 'BI_MAT_TEST',
  vnpayApiUrl: 'https://vnpay.test/api',
} as AppConfig;

const payment = {
  ref: 'REF1',
  amount: 100_000,
  transactionNo: '123',
  clientIp: '127.0.0.1',
  createdAt: new Date('2026-11-01T00:00:00Z'),
} as Payment;

describe('VnpayGateway.refund', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  const reply = (code: string) =>
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ vnp_ResponseCode: code, vnp_Message: 'x' }), { status: 200 }),
    );
  const gateway = new VnpayGateway(config);

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it('00: đã hoàn', async () => {
    reply('00');
    expect((await gateway.refund(payment, 100_000, 'R1')).status).toBe('SUCCEEDED');
  });

  it('94: VNPay đang xử lý lệnh trước, ghi không rõ để tra cứu, không được gửi lại', async () => {
    reply('94');
    expect((await gateway.refund(payment, 100_000, 'R1')).status).toBe('UNKNOWN');
  });

  it('95: VNPay từ chối hẳn', async () => {
    reply('95');
    expect((await gateway.refund(payment, 100_000, 'R1')).status).toBe('FAILED');
  });

  it('lỗi mạng: không rõ', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));
    expect((await gateway.refund(payment, 100_000, 'R1')).status).toBe('UNKNOWN');
  });
});
