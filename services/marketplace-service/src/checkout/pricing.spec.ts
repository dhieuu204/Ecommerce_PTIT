import { applyPlatformVoucher, itemDiscounts, splitByWeight, voucherDiscount } from './pricing';

describe('Tính tiền checkout', () => {
  describe('voucherDiscount', () => {
    const amount = {
      discountType: 'AMOUNT' as const,
      value: 50_000,
      maxDiscount: null,
      minOrder: 0,
    };
    const percent = {
      discountType: 'PERCENT' as const,
      value: 10,
      maxDiscount: 30_000,
      minOrder: 0,
    };

    it('giảm số tiền cố định, không quá tiền hàng', () => {
      expect(voucherDiscount(amount, 300_000)).toBe(50_000);
      expect(voucherDiscount(amount, 40_000)).toBe(40_000);
    });

    it('giảm % làm tròn xuống, có trần', () => {
      expect(voucherDiscount(percent, 123_456)).toBe(12_345);
      expect(voucherDiscount(percent, 1_000_000)).toBe(30_000);
    });

    it('chưa đạt đơn tối thiểu thì không giảm (đúng bằng mức tối thiểu thì được)', () => {
      expect(voucherDiscount({ ...amount, minOrder: 500_000 }, 499_999)).toBe(0);
      expect(voucherDiscount({ ...amount, minOrder: 500_000 }, 500_000)).toBe(50_000);
      expect(voucherDiscount(amount, 0)).toBe(0);
    });
  });

  describe('splitByWeight', () => {
    it('ví dụ của sơ đồ FLOW-02: 50.000đ chia A 33.334đ, B 16.666đ', () => {
      expect(splitByWeight(50_000, [200_000, 100_000])).toEqual([33_334, 16_666]);
    });

    it('tổng các phần luôn đúng bằng số cần chia; phần dư vào phần lớn nhất', () => {
      const parts = splitByWeight(100, [1, 1, 1]);
      expect(parts).toEqual([34, 33, 33]);
      expect(splitByWeight(10, [1, 5, 2])).toEqual([1, 7, 2]);
      for (const total of [0, 1, 7, 99_999, 1_234_567]) {
        const p = splitByWeight(total, [3, 17, 0, 250_000, 1]);
        expect(p.reduce((a, b) => a + b, 0)).toBe(total);
        expect(p.every((x) => x >= 0)).toBe(true);
      }
    });

    it('trọng số 0 không nhận phần nào (trừ khi tất cả bằng 0)', () => {
      expect(splitByWeight(1000, [0, 500])).toEqual([0, 1000]);
      expect(splitByWeight(1000, [0, 0])).toEqual([1000, 0]);
      expect(splitByWeight(1000, [])).toEqual([]);
    });
  });

  it('applyPlatformVoucher: chia theo tiền hàng sau voucher shop, phí ship không giảm', () => {
    const { shops, total } = applyPlatformVoucher(
      [
        { subtotal: 220_000, shopDiscount: 20_000, shippingFee: 30_000 },
        { subtotal: 100_000, shopDiscount: 0, shippingFee: 25_000 },
      ],
      50_000,
    );
    expect(shops.map((s) => s.platformDiscount)).toEqual([33_334, 16_666]);
    expect(shops.map((s) => s.total)).toEqual([196_666, 108_334]);
    expect(total).toBe(305_000);
  });

  it('itemDiscounts: chia giảm giá của đơn con về từng dòng hàng', () => {
    expect(itemDiscounts([200_000, 100_000], 30_001)).toEqual([20_001, 10_000]);
  });
});
