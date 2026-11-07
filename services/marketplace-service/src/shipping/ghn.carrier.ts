import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config';
import { ghnServiceType, GHN_HEAVY_SERVICE } from '../locations/ghn.client';
import {
  CarrierRejectedError,
  type CarrierShipment,
  type CreateShipmentInput,
  type ShipmentParty,
  type ShippingCarrier,
} from './carrier';

interface GhnBody<T> {
  code: number;
  message?: string;
  code_message_value?: string;
  data?: T;
}

/**
 * Tên phường, quận, tỉnh của một đầu vận đơn. Thiếu thì từ chối luôn: gửi thiếu, GHN không báo lỗi mà lấy
 * địa chỉ của shop đăng ký trên GHN, nên lấy hàng hoặc giao hàng sai chỗ.
 */
function placeNames(party: ShipmentParty, side: string) {
  if (!party.wardName || !party.districtName || !party.provinceName) {
    throw new CarrierRejectedError(
      `Không tìm thấy tên phường/xã, quận/huyện của địa chỉ ${side} trong danh sách GHN. Cần cập nhật lại địa chỉ.`,
    );
  }
  return {
    ward: party.wardName,
    district: party.districtName,
    province: party.provinceName,
  };
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
    const from = placeNames(input.from, 'gửi');
    const to = placeNames(input.to, 'nhận');
    const serviceTypeId = ghnServiceType(input.weight);
    const dimensions = {
      length: c.packageLengthCm,
      width: c.packageWidthCm,
      height: c.packageHeightCm,
    };
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
        from_ward_name: from.ward,
        from_district_name: from.district,
        from_province_name: from.province,
        to_name: input.to.name,
        to_phone: input.to.phone,
        to_address: input.to.address,
        to_district_id: input.to.districtId,
        to_ward_code: input.to.wardCode,
        to_ward_name: to.ward,
        to_district_name: to.district,
        to_province_name: to.province,
        cod_amount: input.codAmount,
        weight: input.weight,
        ...dimensions,
        service_type_id: serviceTypeId,
        // Hàng nặng: GHN bắt buộc mỗi món có kích thước và khối lượng
        items:
          serviceTypeId === GHN_HEAVY_SERVICE
            ? input.items.map((i) => ({ ...i, ...dimensions }))
            : input.items,
      },
    );
    return { ghnCode: data.order_code, fee: data.total_fee ?? null };
  }

  async findByClientCode(clientCode: string): Promise<CarrierShipment | null> {
    try {
      const query = new URLSearchParams({ client_order_code: clientCode });
      const data = await this.request<{ order_code: string }>(
        'GET',
        `/v2/shipping-order/detail-by-client-code?${query}`,
      );
      // API này không trả phí ship
      return data?.order_code ? { ghnCode: data.order_code, fee: null } : null;
    } catch (e) {
      if (e instanceof CarrierRejectedError) return null; // GHN báo không có đơn
      throw e;
    }
  }

  async cancelOrder(ghnCode: string): Promise<'CANCELLED' | 'ALREADY_PICKED'> {
    const data = await this.post<Array<{ order_code: string; result: boolean; message?: string }>>(
      '/v2/switch-status/cancel',
      { order_codes: [ghnCode], reason_code: 'GHN-CANCEL-OTHER' },
    );
    return data?.[0]?.result === false ? 'ALREADY_PICKED' : 'CANCELLED';
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Token: this.config.ghnToken,
      'Content-Type': 'application/json',
    };
    if (this.config.ghnShopId) headers.ShopId = this.config.ghnShopId;
    const res = await fetch(`${this.config.ghnApiUrl}${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
