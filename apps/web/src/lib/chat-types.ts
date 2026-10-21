/** Kiểu dữ liệu chat (MSG-01) và thông báo (MSG-02), khớp API marketplace-service */

export type ChatRole = 'BUYER' | 'SHOP';
export type MessageType = 'TEXT' | 'IMAGE' | 'PRODUCT' | 'ORDER';

/** Thẻ sản phẩm chụp lại lúc gửi */
export interface ProductCard {
  kind: 'PRODUCT';
  productId: string;
  name: string;
  image: string | null;
  minPrice: number;
  maxPrice: number;
  shopName: string;
}

/** Thẻ đơn hàng (đơn con của người mua ở shop này) */
export interface OrderCard {
  kind: 'ORDER';
  shopOrderId: string;
  orderId: string;
  code: string;
  status: string;
  total: number;
  itemCount: number;
  image: string | null;
  firstItemName: string;
  placedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderRole: ChatRole;
  type: MessageType;
  text: string | null;
  /** Ảnh trong bucket riêng tư, xem qua GET /chat-images/... (khóa = đường dẫn) */
  imageKey: string | null;
  card: ProductCard | OrderCard | null;
  clientKey: string;
  createdAt: string;
}

export interface MessagesPage {
  /** Theo thứ tự thời gian (cũ trước) */
  items: ChatMessage[];
  hasMore: boolean;
}

export interface Conversation {
  id: string;
  /** Vai của tôi trong cuộc trò chuyện */
  role: ChatRole;
  shop: { id: string; name: string; logoUrl: string | null; suspended: boolean };
  buyer: { id: string; name: string };
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** Số tin tôi chưa đọc */
  unread: number;
  /** Số tin bên kia chưa đọc (0 = đã xem hết) */
  otherUnread: number;
  createdAt: string;
}

export interface ChatUnread {
  buyer: number;
  shop: number;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  content: string;
  /** Đường dẫn trong web, ví dụ /tai-khoan/don-mua/... */
  link: string | null;
  read: boolean;
  readAt: string | null;
  createdAt: string;
}

/** Thẻ đính kèm đang chờ người dùng bấm gửi (từ nút "Chat với shop") */
export type ChatAttach =
  { kind: 'PRODUCT'; productId: string } | { kind: 'ORDER'; shopOrderId: string; code: string };
