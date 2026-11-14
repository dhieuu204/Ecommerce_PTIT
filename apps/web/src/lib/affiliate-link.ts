/**
 * Link tiếp thị của cộng tác viên (P7, AFF-03). Mở trang sản phẩm/shop có `?aff=<mã CTV>` thì ghi một lượt
 * bấm ở marketplace, giữ mã lượt bấm trong trình duyệt theo từng shop (lượt mới thay lượt cũ), gửi kèm
 * khi đặt hàng. Lượt bấm còn gắn với tài khoản nếu đang đăng nhập, nên trình duyệt mất dữ liệu cũng không sao.
 */
import { API, api } from './api';

const STORE = 'hk.affiliate-clicks';

type Clicks = Record<string, { clickId: string; expiresAt: string }>;

function read(): Clicks {
  try {
    const raw = localStorage.getItem(STORE);
    return raw ? (JSON.parse(raw) as Clicks) : {};
  } catch {
    return {};
  }
}

function write(clicks: Clicks): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(clicks));
  } catch {
    // trình duyệt chặn lưu trữ: lượt bấm vẫn gắn với tài khoản nếu đang đăng nhập
  }
}

/** Mã lượt bấm còn hạn, gửi kèm khi đặt hàng (bỏ luôn lượt đã hết hạn) */
export function affiliateClickIds(): string[] {
  const now = Date.now();
  const clicks = read();
  const alive = Object.fromEntries(
    Object.entries(clicks).filter(([, c]) => new Date(c.expiresAt).getTime() > now),
  );
  if (Object.keys(alive).length !== Object.keys(clicks).length) write(alive);
  return Object.values(alive).map((c) => c.clickId);
}

/**
 * Ghi lượt bấm cho link vừa mở. Mã sai hoặc CTV không còn hoạt động thì bỏ qua lặng lẽ: trang vẫn mở
 * bình thường, người mua không thấy lỗi.
 */
export async function recordAffiliateClick(
  code: string,
  target: { productId: string } | { shopId: string },
): Promise<void> {
  try {
    const r = await api<{ clickId: string; shopId: string; expiresAt: string }>(
      `${API.market}/affiliate-clicks`,
      { method: 'POST', body: { code, ...target } },
    );
    write({ ...read(), [r.shopId]: { clickId: r.clickId, expiresAt: r.expiresAt } });
  } catch {
    // link hết hiệu lực: không làm gì
  }
}

/** Link tiếp thị đầy đủ để CTV sao chép */
export function affiliateLink(
  code: string,
  target: { productId: string } | { shopId: string },
): string {
  const path = 'productId' in target ? `/san-pham/${target.productId}` : `/shop/${target.shopId}`;
  return `${window.location.origin}${path}?aff=${encodeURIComponent(code)}`;
}
