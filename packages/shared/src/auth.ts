/**
 * Bộ quyền admin. Một tài khoản có thể có nhiều bộ quyền hoặc không có bộ nào.
 * "Seller" không phải bộ quyền: marketplace-service tự biết ai là chủ shop.
 */
export const PERMISSIONS = ['MODERATION', 'SUPPORT', 'FINANCE', 'SYSTEM'] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Nội dung access token (JWT RS256) do user-service ký. Sống 15 phút. */
export interface JwtClaims {
  iss: 'user-service';
  aud: 'san';
  /** userId (UUID) */
  sub: string;
  email: string;
  /** Họ tên hiển thị */
  name: string;
  /** Bộ quyền admin; rỗng nếu không phải admin */
  perms: Permission[];
  iat: number;
  exp: number;
}
