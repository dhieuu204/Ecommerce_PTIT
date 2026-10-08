/** Dạng lỗi chung của mọi API. `message` bằng tiếng Việt để web hiển thị thẳng. */
export interface ErrorBody {
  /** Mã lỗi viết hoa, ví dụ VALIDATION_ERROR, LOGIN_LOCKED */
  code: string;
  message: string;
  /** Thông tin thêm, ví dụ { fields: { email: '...' } } hoặc { retryAfterSeconds: 840 } */
  details?: Record<string, unknown>;
}

/** Kết quả danh sách có phân trang. page từ 1, pageSize mặc định 20, tối đa 100. */
export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
