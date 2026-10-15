import { discountShare, returnAmounts, shopDiscountByLine, type ReturnLine } from './return-money';

describe('Tiền trả hàng (REF-02, VCH-03)', () => {
  // Đơn con: áo 200.000 × 2, mũ 50.000 × 1 (tiền hàng 450.000). Voucher shop 45.000, phần voucher sàn
  // 30.000 → giảm cả đơn 75.000, chia theo thành tiền: áo 400/450, mũ 50/450.
  const lines: ReturnLine[] = [
    { id: 'ao', price: 200_000, quantity: 2, discount: 66_667 },
    { id: 'mu', price: 50_000, quantity: 1, discount: 8_333 },
  ];
  const shopDiscount = 45_000;

  it('chia voucher shop theo thành tiền như lúc đặt, phần dư vào dòng lớn nhất', () => {
    const m = shopDiscountByLine(lines, shopDiscount);
    expect(m.get('ao')).toBe(40_000);
    expect(m.get('mu')).toBe(5_000);
  });

  it('hai dòng bằng tiền: phần dư luôn vào cùng một dòng dù database trả về theo thứ tự nào', () => {
    const a: ReturnLine = { id: 'a', price: 100_000, quantity: 1, discount: 5_001 };
    const b: ReturnLine = { id: 'b', price: 100_000, quantity: 1, discount: 5_000 };
    const m1 = shopDiscountByLine([a, b], 3);
    const m2 = shopDiscountByLine([b, a], 3);
    expect([...m1.entries()].sort()).toEqual([...m2.entries()].sort());
    expect(m1.get('a')! + m1.get('b')!).toBe(3);
  });

  it('phần voucher shop của dòng không vượt phần giảm giá đã chia cho dòng lúc đặt', () => {
    const m = shopDiscountByLine([{ id: 'x', price: 10_000, quantity: 1, discount: 900 }], 1_000);
    expect(m.get('x')).toBe(900);
  });

  it('trả hết mọi món: hoàn đúng tiền hàng sau voucher, seller bị trừ đúng tiền hàng sau voucher shop', () => {
    const r = returnAmounts(lines, shopDiscount, [
      { orderItemId: 'ao', quantity: 2 },
      { orderItemId: 'mu', quantity: 1 },
    ]);
    expect(r.refundAmount).toBe(450_000 - 75_000);
    expect(r.sellerBase).toBe(450_000 - 45_000);
  });

  it('trả một phần số lượng: phần giảm làm tròn lên nên tiền hoàn làm tròn xuống', () => {
    // 1/2 của 66.667 = 33.333,5 → giảm 33.334, hoàn 166.666
    const r = returnAmounts(lines, shopDiscount, [{ orderItemId: 'ao', quantity: 1 }]);
    expect(r.items[0]).toEqual({
      orderItemId: 'ao',
      quantity: 1,
      refundAmount: 166_666,
      sellerBase: 180_000,
    });
  });

  it('hai lần trả từng nửa không bao giờ hoàn quá số đã trả cho dòng', () => {
    const half = returnAmounts(lines, shopDiscount, [{ orderItemId: 'ao', quantity: 1 }]);
    expect(half.refundAmount * 2).toBeLessThanOrEqual(400_000 - 66_667);
  });

  it('dòng không có giảm giá: hoàn đúng giá × số lượng', () => {
    const r = returnAmounts([{ id: 'x', price: 120_000, quantity: 3, discount: 0 }], 0, [
      { orderItemId: 'x', quantity: 2 },
    ]);
    expect(r.refundAmount).toBe(240_000);
    expect(r.sellerBase).toBe(240_000);
  });

  it('discountShare: trả hết thì lấy nguyên phần giảm, trả một phần thì làm tròn lên', () => {
    expect(discountShare(100, 3, 3)).toBe(100);
    expect(discountShare(100, 1, 3)).toBe(34);
    expect(discountShare(0, 1, 3)).toBe(0);
  });
});
