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

  /** Tất cả quận/huyện của cả nước */
  districts(): Promise<GhnDistrict[]> {
    return this.get('/master-data/district');
  }

  wards(districtId: number): Promise<GhnWard[]> {
    return this.get(`/master-data/ward?district_id=${districtId}`);
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
