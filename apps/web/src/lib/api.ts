/**
 * Gọi API của 4 service qua cùng địa chỉ web (Vite proxy khi dev, Ingress khi chạy thật).
 * - Access token giữ trong bộ nhớ (không lưu localStorage), gửi kèm header Authorization.
 * - Refresh token nằm trong cookie httpOnly do user-service đặt; JavaScript không đọc được.
 * - Gặp 401 TOKEN_EXPIRED: tự làm mới vé một lần rồi gọi lại.
 */
import type { ErrorBody } from '@san/shared';
import type { SessionUser } from './types';

export const API = {
  user: '/api/user/v1',
  market: '/api/market/v1',
  payment: '/api/payment/v1',
  approval: '/api/approval/v1',
} as const;

/** Lỗi API theo dạng chung { code, message, details } (docs/api/README.md mục Lỗi) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }

  /** Lỗi từng ô của form (details.fields), ví dụ { email: 'Email không hợp lệ.' } */
  get fields(): Record<string, string> {
    return (this.details.fields as Record<string, string> | undefined) ?? {};
  }
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

// ----- Vé đăng nhập (access token) và người đang đăng nhập -----

type Session = { status: 'loading' } | { status: 'guest' } | { status: 'user'; user: SessionUser };

let accessToken: string | null = null;
let session: Session = { status: 'loading' };
const listeners = new Set<() => void>();

export const sessionStore = {
  get: () => session,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function setSession(next: Session) {
  session = next;
  listeners.forEach((l) => l());
}

/** Lưu kết quả đăng nhập (sau đăng nhập, xác minh email, làm mới vé) */
export function applyLogin(result: LoginResult) {
  accessToken = result.accessToken;
  setSession({ status: 'user', user: result.user });
}

export function clearSession() {
  accessToken = null;
  setSession({ status: 'guest' });
}

let refreshing: Promise<boolean> | null = null;

/**
 * Lấy vé mới bằng cookie refresh. Mỗi lần chỉ một yêu cầu làm mới (refresh token dùng một lần,
 * hai yêu cầu cùng lúc thì một cái sẽ bị từ chối).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API.user}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        clearSession();
        return false;
      }
      applyLogin((await res.json()) as LoginResult);
      return true;
    } catch {
      clearSession();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ----- Gọi API -----

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Dữ liệu JSON gửi lên */
  body?: unknown;
  /** Gửi file (multipart) */
  formData?: FormData;
  /** Header Idempotency-Key cho API chống gửi lặp */
  idempotencyKey?: string;
  /** Tham số trên đường dẫn ?a=1&b=2 (bỏ giá trị rỗng) */
  query?: Record<string, string | number | undefined | null>;
}

export async function api<T>(
  path: string,
  options: RequestOptions = {},
  retried = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let url = path;
  if (options.query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    if ([...params].length) url += `?${params}`;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      body:
        options.formData ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Không kết nối được máy chủ. Bạn kiểm tra mạng rồi thử lại.',
    );
  }

  if (res.ok) {
    if (res.status === 204 || res.status === 202) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  let body: Partial<ErrorBody> = {};
  try {
    body = (await res.json()) as ErrorBody;
  } catch {
    // máy chủ trả lỗi không đúng dạng (ví dụ proxy báo service chưa chạy)
  }
  if (res.status === 401 && body.code === 'TOKEN_EXPIRED' && !retried) {
    if (await refreshSession()) return api<T>(path, options, true);
  }
  if (res.status === 401 && accessToken) clearSession();
  throw new ApiError(
    res.status,
    body.code ?? 'INTERNAL_ERROR',
    body.message ??
      (res.status >= 500 ? 'Máy chủ đang bận hoặc chưa chạy, bạn thử lại sau.' : 'Có lỗi xảy ra.'),
    body.details,
  );
}

/** Tải file cần đăng nhập (ví dụ ảnh biên lai trong bucket riêng tư), trả Blob */
export async function apiBlob(path: string, retried = false): Promise<Blob> {
  const res = await fetch(path, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  });
  if (res.status === 401 && !retried && (await refreshSession())) return apiBlob(path, true);
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Chưa tải được file.');
  return res.blob();
}

/** Mở trang đăng nhập Google (chuyển hẳn sang Google, xong quay về returnTo) */
export function startGoogleLogin(returnTo = '/') {
  window.location.href = `${API.user}/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}
