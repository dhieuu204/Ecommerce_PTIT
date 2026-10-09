import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Đưa lỗi API lên form: lỗi từng ô (details.fields, cả ô lồng nhau như pickupAddress.wardCode)
 * hiện ngay dưới ô đó; lỗi chung hiện thành thông báo. Trả về true nếu đã gắn được vào ô.
 */
export function showApiError<T extends FieldValues>(
  error: unknown,
  setError?: UseFormSetError<T>,
): boolean {
  if (error instanceof ApiError) {
    const fields = Object.entries(error.fields);
    if (setError && fields.length > 0) {
      fields.forEach(([name, message], i) =>
        setError(name as Path<T>, { type: 'server', message }, { shouldFocus: i === 0 }),
      );
      return true;
    }
    toast.error(error.message);
    return false;
  }
  toast.error('Có lỗi xảy ra, bạn thử lại.');
  return false;
}

/** Mã chống gửi lặp cho mỗi lần bấm nút gửi */
export const newIdempotencyKey = () => crypto.randomUUID();
