import { toPrefixQuery } from './search';

describe('toPrefixQuery', () => {
  it('bỏ dấu, chữ thường, mỗi từ khớp đầu từ', () => {
    expect(toPrefixQuery('Điện thoại iP')).toBe('dien:* & thoai:* & ip:*');
    expect(toPrefixQuery('dien thoai')).toBe('dien:* & thoai:*');
    expect(toPrefixQuery('iPhone-16 Pro')).toBe('iphone:* & 16:* & pro:*');
  });

  it('bỏ ký tự đặc biệt của tsquery; không còn từ nào → null', () => {
    expect(toPrefixQuery("a' | b & !c:*")).toBe('a:* & b:* & c:*');
    expect(toPrefixQuery('  &|!  ')).toBeNull();
    expect(toPrefixQuery(undefined)).toBeNull();
  });
});
