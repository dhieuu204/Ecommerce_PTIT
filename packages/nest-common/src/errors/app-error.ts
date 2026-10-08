import { HttpStatus } from '@nestjs/common';

/**
 * Lỗi nghiệp vụ có mã riêng. Ném lỗi này trong service, filter sẽ trả về đúng dạng chung:
 * { code, message, details }.
 *
 * Ví dụ: throw new AppError(409, 'EMAIL_TAKEN', 'Email này đã có tài khoản.');
 */
export class AppError extends Error {
  constructor(
    readonly status: HttpStatus | number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
