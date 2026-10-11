import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import {
  CarrierRejectedError,
  type CarrierShipment,
  type CreateShipmentInput,
  type ShippingCarrier,
} from './carrier';

interface GhnBody<T> {
  code: number;
  message?: string;
  code_message_value?: string;
  data?: T;
}

/**
 * GHN môi trường dev (SHIP-02). Tạo vận đơn với `client_order_code` = mã đơn con; người gửi trả phí
 * (người mua đã trả phí ship cho sàn). Token chỉ đọc từ .env, không ghi ra log.
 */
export class GhnCarrier implements ShippingCarrier {
  readonly kind = 'GHN' as const;
  private readonly logger = new Logger('GHN');

  constructor(private readonly config: AppConfig) {}

  async createOrder(input: CreateShipmentInput): Promise<CarrierShipment> {
    const c = this.config;
    const data = await this.post<{ order_code: string; total_fee?: number }>(
      '/v2/shipping-order/create',
      {
        payment_type_id: 1,
        required_note: 'CHOXEMHANGKHONGTHU',
        client_order_code: input.clientCode,
        from_name: input.from.name,
        from_phone: input.from.phone,
        from_address: input.from.address,
        from_district_id: input.from.districtId,
        from_ward_code: input.from.wardCode,
        to_name: input.to.name,
        to_phone: input.to.phone,
        to_address: input.to.address,
        to_district_id: input.to.districtId,
        to_ward_code: input.to.wardCode,
        cod_amount: input.codAmount,
        weight: input.weight,
        length: c.packageLengthCm,
        width: c.packageWidthCm,
        height: c.packageHeightCm,
        service_type_id: 2,
        items: input.items,
      },
    );
    return { ghnCode: data.order_code, fee: data.total_fee ?? null };
  }

  async findByClientCode(clientCode: string): Promise<CarrierShipment | null> {
    try {
      const data = await this.post<{ order_code: string; total_fee?: number }>(
        '/v2/shipping-order/detail-by-client-code',
        { client_order_code: clientCode },
      );
      return data?.order_code ? { ghnCode: data.order_code, fee: data.total_fee ?? null } : null;
    } catch (e) {
      if (e instanceof CarrierRejectedError) return null; // GHN báo không có đơn
      throw e;
    }
  }

  async cancelOrder(ghnCode: string): Promise<'CANCELLED' | 'ALREADY_PICKED'> {
    const data = await this.post<Array<{ order_code: string; result: boolean; message?: string }>>(
      '/v2/switch-status/cancel',
      { order_codes: [ghnCode] },
    );
    return data?.[0]?.result === false ? 'ALREADY_PICKED' : 'CANCELLED';
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Token: this.config.ghnToken,
      'Content-Type': 'application/json',
    };
    if (this.config.ghnShopId) headers.ShopId = this.config.ghnShopId;
    const res = await fetch(`${this.config.ghnApiUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as GhnBody<T> | null;
    if (res.status >= 500 || !json) throw new Error(`GHN ${path} trả HTTP ${res.status}`);
    if (json.code !== 200) {
      const msg = json.code_message_value ?? json.message ?? String(json.code);
      this.logger.warn(`GHN ${path} từ chối: ${msg}`);
      throw new CarrierRejectedError(`GHN từ chối: ${msg}`);
    }
    return json.data as T;
  }
}
