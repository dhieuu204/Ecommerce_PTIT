/** Sự kiện thông báo (P6, MSG-02). */

/**
 * marketplace-service → marketplace-service và user-service: vừa tạo một thông báo cho một người.
 * - marketplace nhận lại để đẩy thông báo tới trình duyệt qua Socket.IO (sau khi dữ liệu đã lưu).
 * - user-service gửi email khi `email` = true (user-service giữ địa chỉ email và hộp thư gửi).
 */
export const NOTIFICATION_CREATED = 'notification.created';
export interface NotificationCreatedPayload {
  notificationId: string;
  userId: string;
  /** Loại thông báo, ví dụ ORDER_DELIVERED (danh sách ở docs/phan-tich/13-quyet-dinh-p6.md) */
  type: string;
  title: string;
  content: string;
  /** Đường dẫn trên web, ví dụ /tai-khoan/don-mua/<id>; trống = không có trang để mở */
  link: string | null;
  /** Gửi thêm email (việc quan trọng) */
  email: boolean;
  createdAt: string;
}
