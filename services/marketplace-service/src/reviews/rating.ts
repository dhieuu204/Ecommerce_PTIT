import { Prisma } from '../../generated/prisma';

/**
 * Sao trung bình (P6, quyết định số 1 mục 2): database chỉ lưu số đánh giá và tổng số sao (số nguyên),
 * sao trung bình = tổng / số, làm tròn 1 chữ số; chưa có đánh giá thì null.
 * Câu SQL lọc và sắp xếp theo sao (`ratingTenthsSql`) làm tròn đúng như hàm này để kết quả khớp số hiển thị.
 */
export function ratingAvg(total: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((total * 10) / count) / 10;
}

/**
 * Sao trung bình × 10 đã làm tròn (ví dụ 4,3 sao → 43), tính trong SQL trên bảng `products` có bí danh `p`.
 * NULL khi chưa có đánh giá.
 */
export const ratingTenthsSql = Prisma.sql`(CASE WHEN p.rating_count > 0 THEN round(p.rating_total * 10.0 / p.rating_count) END)`;

/**
 * Che bớt tên người đánh giá khi hiện công khai: giữ chữ đầu và chữ cuối, ví dụ "Nguyễn Văn An" → "N***n".
 * Tên một chữ: "A***".
 */
export function maskName(name: string): string {
  const chars = Array.from(name.trim());
  if (chars.length === 0) return 'Người mua';
  if (chars.length === 1) return `${chars[0]}***`;
  return `${chars[0]}***${chars[chars.length - 1]}`;
}
