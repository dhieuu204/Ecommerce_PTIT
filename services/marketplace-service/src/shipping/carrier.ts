/** Thông tin tạo một vận đơn (một kiện của một đơn con) */
export interface CreateShipmentInput {
  /** client_order_code gửi GHN (= mã đơn con): GHN không cho trùng nên gửi lại không tạo vận đơn thứ hai */
  clientCode: string;
  from: { name: string; phone: string; address: string; districtId: number; wardCode: string };
  to: { name: string; phone: string; address: string; districtId: number; wardCode: string };
  /** Số tiền GHN thu hộ (0 với trả trước) */
  codAmount: number;
  /** gram */
  weight: number;
  items: Array<{ name: string; quantity: number; weight: number }>;
}

export interface CarrierShipment {
  ghnCode: string;
  /** Phí GHN tính cho vận đơn */
  fee: number | null;
}

/** GHN từ chối hẳn (dữ liệu sai, địa chỉ không phục vụ...): không thử lại tự động */
export class CarrierRejectedError extends Error {}

/**
 * Lớp adapter đơn vị vận chuyển (quyết định MAP-01 số 4): GHN môi trường dev khi có token, MÔ PHỎNG khi
 * chưa có. Lỗi mạng/không phản hồi thì ném Error thường: người gọi ghi "chưa rõ" rồi tra cứu sau.
 */
export interface ShippingCarrier {
  readonly kind: 'GHN' | 'MOCK';
  createOrder(input: CreateShipmentInput): Promise<CarrierShipment>;
  /** Tra vận đơn theo mã của sàn (dùng khi tạo bị lỗi mạng); null = GHN chưa có vận đơn này */
  findByClientCode(clientCode: string): Promise<CarrierShipment | null>;
  /** Hủy vận đơn. 'ALREADY_PICKED': GHN đã lấy hàng, không hủy được */
  cancelOrder(ghnCode: string): Promise<'CANCELLED' | 'ALREADY_PICKED'>;
}

export const SHIPPING_CARRIER = Symbol('SHIPPING_CARRIER');
