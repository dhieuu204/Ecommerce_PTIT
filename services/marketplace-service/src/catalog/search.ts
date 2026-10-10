/**
 * Đổi chữ người dùng gõ thành câu truy vấn full-text khớp đầu từ, đã bỏ dấu, ví dụ
 * "Điện thoại iP" → "dien:* & thoai:* & ip:*". Khớp với cột products.search_vector
 * (to_tsvector('simple', f_unaccent(lower(name)))). Chỉ giữ chữ a-z và số nên an toàn khi đưa vào
 * to_tsquery (vẫn truyền bằng tham số, không nối chuỗi vào SQL). Không còn từ nào thì trả null.
 */
export function toPrefixQuery(q: string | undefined): string | null {
  if (!q) return null;
  const terms = q
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, 10);
  return terms.length ? terms.map((t) => `${t}:*`).join(' & ') : null;
}
