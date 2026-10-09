import { compare, hash } from 'bcryptjs';

/** Băm mật khẩu bằng bcrypt (độ khó 10). Không bao giờ lưu hay ghi log mật khẩu gốc. */
export function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export function checkPassword(password: string, passwordHash: string): Promise<boolean> {
  return compare(password, passwordHash);
}
