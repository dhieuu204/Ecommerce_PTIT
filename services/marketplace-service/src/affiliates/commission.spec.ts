import {
  lineCommissions,
  newAffiliateCode,
  pickClick,
  returnedCommission,
  type ClickCandidate,
} from './commission';

describe('lineCommissions (AFF-04)', () => {
  it('tính trên thành tiền, làm tròn xuống, sản phẩm không bật thì 0', () => {
    const r = lineCommissions(
      [
        { id: 'a', price: 199_999, quantity: 1, discount: 0, rate: 500 },
        { id: 'b', price: 50_000, quantity: 2, discount: 0, rate: null },
        { id: 'c', price: 10_000, quantity: 3, discount: 0, rate: 1234 },
      ],
      0,
    );
    expect(r).toEqual([
      { id: 'a', rate: 500, commission: 9_999 },
      { id: 'b', rate: 0, commission: 0 },
      { id: 'c', rate: 1234, commission: 3_702 },
    ]);
  });

  it('trừ phần voucher shop của dòng, không trừ phần voucher sàn', () => {
    // Voucher shop 30.000đ chia theo thành tiền 200.000 / 100.000 → 20.000 / 10.000.
    // discount của dòng gồm cả voucher sàn (lớn hơn phần voucher shop) nên không ảnh hưởng
    const r = lineCommissions(
      [
        { id: 'a', price: 100_000, quantity: 2, discount: 30_000, rate: 1000 },
        { id: 'b', price: 100_000, quantity: 1, discount: 15_000, rate: 1000 },
      ],
      30_000,
    );
    expect(r.map((x) => x.commission)).toEqual([18_000, 9_000]);
  });

  it('không bao giờ âm khi voucher shop bằng cả tiền hàng', () => {
    const r = lineCommissions(
      [{ id: 'a', price: 10_000, quantity: 1, discount: 10_000, rate: 3000 }],
      10_000,
    );
    expect(r[0]!.commission).toBe(0);
  });
});

describe('pickClick (AFF-04)', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const click = (id: string, over: Partial<ClickCandidate> = {}): ClickCandidate => ({
    id,
    affiliateId: `aff-${id}`,
    affiliateUserId: `user-${id}`,
    affiliateStatus: 'ACTIVE',
    createdAt: new Date('2026-11-12T10:00:00Z'),
    expiresAt: new Date('2026-11-19T10:00:00Z'),
    ...over,
  });

  it('chọn lượt bấm mới nhất', () => {
    const r = pickClick(
      [click('1'), click('2', { createdAt: new Date('2026-11-13T09:00:00Z') })],
      'buyer',
      'owner',
      now,
    );
    expect(r?.id).toBe('2');
  });

  it('bỏ lượt hết hạn và CTV không còn hoạt động', () => {
    const r = pickClick(
      [
        click('old'),
        click('expired', {
          createdAt: new Date('2026-11-06T09:00:00Z'),
          expiresAt: new Date('2026-11-13T09:00:00Z'),
        }),
        click('locked', {
          createdAt: new Date('2026-11-13T09:30:00Z'),
          affiliateStatus: 'SUSPENDED',
        }),
      ],
      'buyer',
      'owner',
      now,
    );
    expect(r?.id).toBe('old');
  });

  it('CTV tự mua hoặc CTV là chủ shop thì không tính, xét lượt của CTV khác', () => {
    const self = click('self', {
      createdAt: new Date('2026-11-13T09:50:00Z'),
      affiliateUserId: 'buyer',
    });
    const owner = click('owner', {
      createdAt: new Date('2026-11-13T09:40:00Z'),
      affiliateUserId: 'owner',
    });
    expect(pickClick([self, owner], 'buyer', 'owner', now)).toBeNull();
    expect(pickClick([self, owner, click('x')], 'buyer', 'owner', now)?.id).toBe('x');
  });
});

describe('returnedCommission (AFF-04)', () => {
  const lines = [
    { id: 'a', quantity: 3, commission: 10_000 },
    { id: 'b', quantity: 1, commission: 0 },
  ];

  it('trả hết dòng thì đúng bằng hoa hồng dòng', () => {
    expect(returnedCommission(lines, [{ orderItemId: 'a', quantity: 3 }])).toBe(10_000);
  });

  it('trả một phần số lượng thì chia theo số lượng, làm tròn xuống', () => {
    expect(returnedCommission(lines, [{ orderItemId: 'a', quantity: 1 }])).toBe(3_333);
  });

  it('dòng không có hoa hồng thì 0', () => {
    expect(returnedCommission(lines, [{ orderItemId: 'b', quantity: 1 }])).toBe(0);
  });
});

describe('newAffiliateCode', () => {
  it('8 ký tự, không có ký tự dễ nhầm', () => {
    let i = 0;
    const code = newAffiliateCode((max) => (i++ * 7) % max);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });
});
