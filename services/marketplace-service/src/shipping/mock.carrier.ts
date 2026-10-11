import { Logger } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import type { CarrierShipment, CreateShipmentInput, ShippingCarrier } from './carrier';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Đơn vị vận chuyển MÔ PHỎNG (chưa có GHN_TOKEN). Tạo vận đơn luôn thành công với mã bắt đầu bằng
 * "SIM"; các mốc lấy hàng, giao, hoàn do admin bấm ở trang GHN mô phỏng. Mọi log ghi "MÔ PHỎNG".
 */
export class MockCarrier implements ShippingCarrier {
  readonly kind = 'MOCK' as const;
  private readonly logger = new Logger('GHN MÔ PHỎNG');

  async createOrder(input: CreateShipmentInput): Promise<CarrierShipment> {
    let suffix = '';
    for (let i = 0; i < 8; i++) suffix += CHARS[randomInt(CHARS.length)];
    const ghnCode = `SIM${suffix}`;
    // Phí mô phỏng: 22.000đ cho 1 kg đầu, thêm 5.000đ mỗi 500 g
    const fee = 22_000 + Math.max(0, Math.ceil((input.weight - 1000) / 500)) * 5_000;
    this.logger.log(`MÔ PHỎNG tạo vận đơn ${ghnCode} cho ${input.clientCode} (${input.weight} g)`);
    return { ghnCode, fee };
  }

  /** Mô phỏng không có trạng thái riêng ngoài database của sàn, nên không có vận đơn "chưa rõ" */
  async findByClientCode(): Promise<CarrierShipment | null> {
    return null;
  }

  async cancelOrder(ghnCode: string): Promise<'CANCELLED' | 'ALREADY_PICKED'> {
    this.logger.log(`MÔ PHỎNG hủy vận đơn ${ghnCode}`);
    return 'CANCELLED';
  }
}
