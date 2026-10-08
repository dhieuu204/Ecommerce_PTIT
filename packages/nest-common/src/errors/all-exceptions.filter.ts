import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ErrorBody } from '@san/shared';
import type { Response } from 'express';
import { currentCorrelationId } from '../context/request-context';
import { AppError } from './app-error';

/** Mã và câu thông báo mặc định cho các lỗi HTTP thường gặp. */
const DEFAULTS: Record<number, [string, string]> = {
  400: ['VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.'],
  401: ['UNAUTHENTICATED', 'Bạn cần đăng nhập.'],
  403: ['FORBIDDEN', 'Bạn không có quyền làm việc này.'],
  404: ['NOT_FOUND', 'Không tìm thấy.'],
  409: ['CONFLICT', 'Dữ liệu đã thay đổi, vui lòng tải lại.'],
  413: ['PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn.'],
  429: ['TOO_MANY_REQUESTS', 'Bạn thao tác quá nhanh, vui lòng thử lại sau.'],
};

/** Biến mọi lỗi thành dạng chung { code, message, details } (docs/api/README.md, mục Lỗi). */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Lỗi');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = toErrorBody(exception);
    if (status >= 500) {
      this.logger.error(
        `[${currentCorrelationId()}] ${exception instanceof Error ? exception.stack : String(exception)}`,
      );
    }
    res.status(status).json(body);
  }
}

export function toErrorBody(exception: unknown): { status: number; body: ErrorBody } {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      body: { code: exception.code, message: exception.message, details: exception.details },
    };
  }
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const [code, message] = DEFAULTS[status] ?? ['ERROR', exception.message];
    return { status, body: { code, message } };
  }
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    body: { code: 'INTERNAL_ERROR', message: 'Có lỗi hệ thống, vui lòng thử lại sau.' },
  };
}
