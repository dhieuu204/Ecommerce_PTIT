import { maskName, ratingAvg } from './rating';

describe('Sao trung bình (ENG-01)', () => {
  it('chưa có đánh giá → null', () => {
    expect(ratingAvg(0, 0)).toBeNull();
  });

  it('làm tròn 1 chữ số', () => {
    expect(ratingAvg(5, 1)).toBe(5);
    expect(ratingAvg(9, 2)).toBe(4.5);
    expect(ratingAvg(13, 3)).toBe(4.3); // 4,333
    expect(ratingAvg(14, 3)).toBe(4.7); // 4,667
    expect(ratingAvg(17, 4)).toBe(4.3); // 4,25 → 4,3 (làm tròn lên khi đúng nửa)
  });
});

describe('Che tên người đánh giá', () => {
  it('giữ chữ đầu và chữ cuối', () => {
    expect(maskName('Nguyễn Văn An')).toBe('N***n');
    expect(maskName('  Ánh  ')).toBe('Á***h');
  });

  it('tên một chữ hoặc trống', () => {
    expect(maskName('A')).toBe('A***');
    expect(maskName('')).toBe('Người mua');
  });
});
