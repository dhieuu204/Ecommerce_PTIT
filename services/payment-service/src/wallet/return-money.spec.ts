import { settleReturn, type EarningAmounts } from './return-money';

describe('Tiền seller sau trả hàng (REF-02, FIN-03)', () => {
  // Đơn con: tiền hàng 450.000, voucher shop 45.000 → tiền hàng sau voucher 405.000, phí 5% = 20.250,
  // seller nhận 384.750
  const e: EarningAmounts = {
    subtotal: 450_000,
    shopDiscount: 45_000,
    platformFeeRate: 500,
    platformFee: 20_250,
    sellerAmount: 384_750,
  };

  it('hoàn toàn bộ một món: bớt tiền hàng sau voucher shop của món đó, phí tính lại', () => {
    // Trả 1 áo: người mua đã trả 180.000 (sau voucher), tiền hàng sau voucher shop 180.000
    const s = settleReturn(e, {
      refundAmount: 180_000,
      maxRefundAmount: 180_000,
      sellerBase: 180_000,
      platformCovers: false,
    });
    // Còn 225.000 → phí 11.250, seller nhận 213.750
    expect(s).toEqual({
      baseReduction: 180_000,
      newPlatformFee: 11_250,
      newSellerAmount: 213_750,
      deduction: 171_000,
      feeReversed: 9_000,
    });
  });

  it('trả hết cả đơn con: seller không còn tiền, sàn không thu phí', () => {
    const s = settleReturn(e, {
      refundAmount: 375_000,
      maxRefundAmount: 375_000,
      sellerBase: 405_000,
      platformCovers: false,
    });
    expect(s).toMatchObject({ newSellerAmount: 0, deduction: 384_750, feeReversed: 20_250 });
  });

  it('admin hoàn một phần: bớt theo tỉ lệ, làm tròn xuống', () => {
    // Hoàn 50.000 / tối đa 180.000 → bớt ⌊180.000 × 50/180⌋ = 50.000
    const s = settleReturn(e, {
      refundAmount: 50_000,
      maxRefundAmount: 180_000,
      sellerBase: 180_000,
      platformCovers: false,
    });
    expect(s.baseReduction).toBe(50_000);
    expect(s.newSellerAmount).toBe(355_000 - Math.floor((355_000 * 500) / 10_000));
    expect(s.deduction).toBe(e.sellerAmount - s.newSellerAmount);
  });

  it('sàn chịu (kiện trả thất lạc): seller không bị trừ, phí giữ nguyên', () => {
    const s = settleReturn(e, {
      refundAmount: 180_000,
      maxRefundAmount: 180_000,
      sellerBase: 180_000,
      platformCovers: true,
    });
    expect(s).toEqual({
      baseReduction: 0,
      newPlatformFee: 20_250,
      newSellerAmount: 384_750,
      deduction: 0,
      feeReversed: 0,
    });
  });

  it('seller nhận cuối cùng không bao giờ âm, không trừ quá số seller được nhận', () => {
    const s = settleReturn(e, {
      refundAmount: 10,
      maxRefundAmount: 10,
      sellerBase: 999_999_999,
      platformCovers: false,
    });
    expect(s.newSellerAmount).toBe(0);
    expect(s.deduction).toBe(e.sellerAmount);
  });
});
