import { Injectable, type PipeTransform } from '@nestjs/common';
import { AppError } from '../errors/app-error';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kiểm mã trên đường dẫn là UUID: `@Param('addressId', ParseIdPipe) addressId: string`.
 * Sai dạng thì trả 404 NOT_FOUND như khi không có (không để database báo lỗi 500).
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID.test(value)) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy.');
    return value;
  }
}
