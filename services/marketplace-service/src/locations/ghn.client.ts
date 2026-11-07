import { Injectable } from '@nestjs/common';
import { AppConfig } from '../config';

export interface GhnProvince {
  ProvinceID: number;
  ProvinceName: string;
}
export interface GhnDistrict {
  DistrictID: number;
  ProvinceID: number;
  DistrictName: string;
}
export interface GhnWard {
  WardCode: string;
  DistrictID: number;
  WardName: string;
}

/** Dịch vụ GHN cho hàng từ 20 kg trở lên (bắt buộc gửi kích thước từng món) */
export const GHN_HEAVY_SERVICE = 5;
/** Quy định của GHN, không phải con số nghiệp vụ của sàn: dưới 20 kg dùng dịch vụ 2, từ 20 kg dùng dịch vụ 5 */
export const ghnServiceType = (weightGrams: number) =>
  weightGrams >= 20_000 ? GHN_HEAVY_SERVICE : 2;

/** Gọi API danh mục địa chỉ của GHN (môi trường dev). Tách riêng để test thay bằng bản giả. */
@Injectable()
export class GhnClient {
  constructor(private readonly config: AppConfig) {}

  get configured(): boolean {
    return Boolean(this.config.ghnToken);
  }

  provinces(): Promise<GhnProvince[]> {
    return this.get('/master-data/province');
  }

  districts(provinceId: number): Promise<GhnDistrict[]> {
    return this.get(`/master-data/district?province_id=${provinceId}`);
  }

  wards(districtId: number): Promise<GhnWard[]> {
    return this.get(`/master-data/ward?district_id=${districtId}`);
  }

  /** Phí giao hàng chuẩn (đồng) cho một kiện (SHIP-01). Lỗi hoặc quá 8 giây thì ném lỗi */
  async fee(input: {
    fromDistrictId: number;
    fromWardCode: string;
    toDistrictId: number;
    toWardCode: string;
    /** gram */
    weight: number;
  }): Promise<number> {
    const headers: Record<string, string> = {
      Token: this.config.ghnToken,
      'Content-Type': 'application/json',
    };
    if (this.config.ghnShopId) headers.ShopId = this.config.ghnShopId;
    const serviceTypeId = ghnServiceType(input.weight);
    const dimensions = {
      length: this.config.packageLengthCm,
      width: this.config.packageWidthCm,
      height: this.config.packageHeightCm,
    };
    const res = await fetch(`${this.config.ghnApiUrl}/v2/shipping-order/fee`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        service_type_id: serviceTypeId,
        from_district_id: input.fromDistrictId,
        from_ward_code: input.fromWardCode,
        to_district_id: input.toDistrictId,
        to_ward_code: input.toWardCode,
        weight: input.weight,
        ...dimensions,
        ...(serviceTypeId === GHN_HEAVY_SERVICE
          ? { items: [{ name: 'Kiện hàng', quantity: 1, weight: input.weight, ...dimensions }] }
          : {}),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`GHN tính phí trả HTTP ${res.status}`);
    const body = (await res.json()) as {
      code: number;
      data?: { total?: number };
      message?: string;
    };
    if (body.code !== 200 || typeof body.data?.total !== 'number') {
      throw new Error(`GHN tính phí báo lỗi: ${body.message ?? body.code}`);
    }
    return body.data.total;
  }

  private async get<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.config.ghnApiUrl}${path}`, {
      headers: { Token: this.config.ghnToken },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`GHN ${path} trả HTTP ${res.status}`);
    const body = (await res.json()) as { code: number; data: T[] | null; message?: string };
    if (body.code !== 200) throw new Error(`GHN ${path} báo lỗi: ${body.message ?? body.code}`);
    return body.data ?? [];
  }
}
