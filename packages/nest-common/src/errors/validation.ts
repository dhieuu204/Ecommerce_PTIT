import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppError } from './app-error';

/**
 * Kiểm dữ liệu gửi lên theo DTO (class-validator). Sai thì trả 400 VALIDATION_ERROR,
 * details.fields = { tênTrường: 'câu báo lỗi đầu tiên' }. Viết câu báo lỗi tiếng Việt trong DTO:
 * @MinLength(8, { message: 'Mật khẩu cần ít nhất 8 ký tự.' })
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    exceptionFactory: (errors) =>
      new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
        fields: collectFields(errors),
      }),
  });
}

function collectFields(errors: ValidationError[], prefix = ''): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const e of errors) {
    const name = prefix + e.property;
    const first = e.constraints ? Object.values(e.constraints)[0] : undefined;
    if (first) fields[name] = first;
    if (e.children?.length) Object.assign(fields, collectFields(e.children, `${name}.`));
  }
  return fields;
}
