/**
 * Quy đổi trạng thái GHN báo về thành sự kiện của sàn (SHIP-03, bảng ở sơ đồ 04).
 * Hàm thuần để test đủ các mã.
 */
export type CarrierEvent =
  | 'READY'
  | 'PICKED'
  | 'DELIVERY_FAILED'
  | 'DELIVERED'
  | 'RETURNING'
  | 'RETURNED'
  | 'CANCELLED'
  | 'INCIDENT';

const MAP: Record<string, CarrierEvent> = {
  ready_to_pick: 'READY',
  picking: 'READY',
  money_collect_picking: 'READY',
  picked: 'PICKED',
  storing: 'PICKED',
  transporting: 'PICKED',
  sorting: 'PICKED',
  delivering: 'PICKED',
  money_collect_delivering: 'PICKED',
  delivery_fail: 'DELIVERY_FAILED',
  delivered: 'DELIVERED',
  waiting_to_return: 'RETURNING',
  return: 'RETURNING',
  return_transporting: 'RETURNING',
  return_sorting: 'RETURNING',
  returning: 'RETURNING',
  returned: 'RETURNED',
  cancel: 'CANCELLED',
  lost: 'INCIDENT',
  damage: 'INCIDENT',
  exception: 'INCIDENT',
  return_fail: 'INCIDENT',
};

/** null = mã lạ (chỉ ghi lịch sử) */
export function mapGhnStatus(status: string): CarrierEvent | null {
  return MAP[status.trim().toLowerCase()] ?? null;
}

/** Nút trên bảng GHN mô phỏng → mã GHN gửi vào cùng đường xử lý như webhook */
export const SIMULATOR_EVENTS = {
  PICKED: 'picked',
  DELIVERY_FAILED: 'delivery_fail',
  DELIVERED: 'delivered',
  RETURN: 'return',
  RETURNED: 'returned',
  LOST: 'lost',
} as const;
export type SimulatorEvent = keyof typeof SIMULATOR_EVENTS;

/**
 * Các nút bấm được với một trạng thái vận đơn. Vận đơn trả hàng (P5, người mua gửi về shop) chỉ có
 * lấy hàng, giao tới shop và thất lạc.
 */
export function nextSimulatorEvents(
  status: string,
  type: 'DELIVERY' | 'RETURN' = 'DELIVERY',
): SimulatorEvent[] {
  if (type === 'RETURN') {
    if (status === 'READY_TO_PICK') return ['PICKED'];
    if (status === 'PICKED') return ['DELIVERED', 'LOST'];
    return [];
  }
  switch (status) {
    case 'READY_TO_PICK':
      return ['PICKED'];
    case 'PICKED':
      return ['DELIVERED', 'DELIVERY_FAILED', 'RETURN', 'LOST'];
    case 'RETURNING':
      return ['RETURNED', 'LOST'];
    default:
      return [];
  }
}
