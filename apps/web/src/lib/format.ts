/** Hiển thị theo giờ Việt Nam (API trả giờ UTC). */
const dateTime = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
const date = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '';
export const formatDate = (iso: string | null | undefined) =>
  iso ? date.format(new Date(iso)) : '';

/** Tiền VND: 12.990.000đ */
export const formatMoney = (vnd: number) => `${vnd.toLocaleString('vi-VN')}đ`;

/** Chữ cái đầu của họ tên để làm ảnh đại diện: "Nguyễn Văn An" → "NA" */
export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Số tài khoản chỉ hiện 4 số cuối: ****5667 */
export const maskAccount = (n: string) => `****${n.slice(-4)}`;

/** Thời gian đã trôi qua: "3 giờ", "2 ngày" */
export function elapsed(iso: string): string {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ`;
  return `${Math.floor(hours / 24)} ngày`;
}
