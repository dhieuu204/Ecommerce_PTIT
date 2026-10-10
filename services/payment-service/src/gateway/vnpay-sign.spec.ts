import {
  hmac512,
  parseVnpDate,
  signData,
  signedQuery,
  verifySignature,
  vnpDate,
} from './vnpay-sign';

describe('Ký dữ liệu VNPay', () => {
  const secret = 'BI_MAT_THU';
  const params = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: 'TMNTHU01',
    vnp_Amount: '29000000',
    vnp_TxnRef: '261011ABC123T1',
    vnp_OrderInfo: 'Thanh toan don 261011ABC123',
  };

  it('sắp tham số theo tên, dấu cách thành +, bỏ tham số rỗng', () => {
    expect(signData({ ...params, vnp_BankCode: '' })).toBe(
      'vnp_Amount=29000000&vnp_Command=pay&vnp_OrderInfo=Thanh+toan+don+261011ABC123' +
        '&vnp_TmnCode=TMNTHU01&vnp_TxnRef=261011ABC123T1&vnp_Version=2.1.0',
    );
  });

  it('chữ ký đúng thì kiểm qua; sửa một tham số hoặc sai khóa thì không qua', () => {
    const query = signedQuery(params, secret);
    const back = Object.fromEntries(new URLSearchParams(query));
    expect(back.vnp_SecureHash).toBe(hmac512(secret, signData(params)));
    expect(verifySignature({ ...back, vnp_SecureHashType: 'HmacSHA512' }, secret)).toBe(true);
    expect(verifySignature({ ...back, vnp_Amount: '1' }, secret)).toBe(false);
    expect(verifySignature(back, 'KHOA_KHAC')).toBe(false);
    expect(verifySignature({ ...params }, secret)).toBe(false);
  });

  it('thời gian định dạng yyyyMMddHHmmss giờ Việt Nam, đọc lại được', () => {
    const d = new Date('2026-10-10T18:05:09Z');
    expect(vnpDate(d)).toBe('20261011010509');
    expect(parseVnpDate('20261011010509')?.toISOString()).toBe('2026-10-10T18:05:09.000Z');
    expect(parseVnpDate('abc')).toBeNull();
  });
});
