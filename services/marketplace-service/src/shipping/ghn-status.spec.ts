import { mapGhnStatus, nextSimulatorEvents } from './ghn-status';

describe('Quy đổi trạng thái GHN', () => {
  it('đủ các nhóm của sơ đồ 04', () => {
    expect(mapGhnStatus('ready_to_pick')).toBe('READY');
    expect(mapGhnStatus('picking')).toBe('READY');
    for (const s of ['picked', 'storing', 'transporting', 'sorting', 'delivering']) {
      expect(mapGhnStatus(s)).toBe('PICKED');
    }
    expect(mapGhnStatus('delivery_fail')).toBe('DELIVERY_FAILED');
    expect(mapGhnStatus('delivered')).toBe('DELIVERED');
    for (const s of ['waiting_to_return', 'return', 'return_transporting', 'returning']) {
      expect(mapGhnStatus(s)).toBe('RETURNING');
    }
    expect(mapGhnStatus('returned')).toBe('RETURNED');
    expect(mapGhnStatus('cancel')).toBe('CANCELLED');
    for (const s of ['lost', 'damage', 'exception', 'return_fail']) {
      expect(mapGhnStatus(s)).toBe('INCIDENT');
    }
  });

  it('không phân biệt hoa thường; mã lạ trả null', () => {
    expect(mapGhnStatus(' Delivered ')).toBe('DELIVERED');
    expect(mapGhnStatus('khong_co')).toBeNull();
  });

  it('nút mô phỏng theo trạng thái vận đơn', () => {
    expect(nextSimulatorEvents('READY_TO_PICK')).toEqual(['PICKED']);
    expect(nextSimulatorEvents('PICKED')).toContain('DELIVERY_FAILED');
    expect(nextSimulatorEvents('DELIVERED')).toEqual([]);
  });

  it('vận đơn trả hàng chỉ có lấy hàng, giao tới shop và thất lạc (P5)', () => {
    expect(nextSimulatorEvents('READY_TO_PICK', 'RETURN')).toEqual(['PICKED']);
    expect(nextSimulatorEvents('PICKED', 'RETURN')).toEqual(['DELIVERED', 'LOST']);
    expect(nextSimulatorEvents('DELIVERED', 'RETURN')).toEqual([]);
  });
});
