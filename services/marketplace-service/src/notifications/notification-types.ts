/**
 * Các loại thông báo (MSG-02). Mỗi loại biết có gửi thêm email hay không (việc quan trọng, quyết định P6 số 4).
 * Bảng đầy đủ người nhận và lúc gửi: docs/phan-tich/13-quyet-dinh-p6.md mục 3.
 */
export const NOTIFICATION_TYPES = {
  // ----- Người mua: đơn hàng -----
  ORDER_CONFIRMED: { email: false },
  ORDER_SHIPPING: { email: false },
  ORDER_DELIVERED: { email: true },
  ORDER_COMPLETED: { email: false },
  ORDER_CANCELLED: { email: true },
  ORDER_FAILED: { email: false },
  REFUND_DONE: { email: true },
  // ----- Người mua: trả hàng -----
  RETURN_ACCEPTED: { email: false },
  RETURN_REJECTED: { email: false },
  RETURN_CLOSED: { email: false },
  RETURN_REFUNDING: { email: false },
  // ----- Seller: đơn, trả hàng, đánh giá -----
  SHOP_ORDER_NEW: { email: false },
  SHOP_ORDER_CANCEL_REQUESTED: { email: false },
  SHOP_ORDER_CANCELLED: { email: false },
  SHOP_RETURN_REQUESTED: { email: false },
  SHOP_RETURN_RESULT: { email: false },
  SHOP_REVIEW_NEW: { email: false },
  // ----- Seller: shop, tiền, kiểm duyệt -----
  SHOP_APPROVED: { email: true },
  SHOP_REJECTED: { email: true },
  SHOP_SUSPENDED: { email: true },
  SHOP_RESTORED: { email: true },
  PRODUCT_REMOVED: { email: true },
  PRODUCT_RESTORED: { email: false },
  WITHDRAWAL_APPROVED: { email: false },
  WITHDRAWAL_REJECTED: { email: true },
  WITHDRAWAL_PAID: { email: true },
  WITHDRAWAL_FAILED: { email: true },
  // ----- Cả hai bên: chat (một thông báo khi cuộc trò chuyện có tin chưa đọc đầu tiên) -----
  CHAT_MESSAGE: { email: false },
} as const satisfies Record<string, { email: boolean }>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;
