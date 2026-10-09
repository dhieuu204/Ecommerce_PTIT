import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { AppConfig } from '../config';

/** Tên tỉnh/huyện/xã đã kiểm, lưu kèm địa chỉ để hiển thị */
export interface LocationNames {
  provinceName: string;
  districtName: string;
  wardName: string;
}

/**
 * Kiểm mã tỉnh/huyện/xã (mã GHN) bằng REST của marketplace-service (chủ dữ liệu địa giới).
 * user-service không giữ bản sao danh sách tỉnh/huyện/xã.
 */
@Injectable()
export class LocationsClient {
  private readonly logger = new Logger(LocationsClient.name);

  constructor(private readonly config: AppConfig) {}

  /** Trả tên nếu cả 3 mã khớp nhau; mã sai → 400 VALIDATION_ERROR chỉ rõ ô sai. */
  async resolve(provinceId: number, districtId: number, wardCode: string): Promise<LocationNames> {
    const province = (await this.get<{ id: number; name: string }>('/locations/provinces')).find(
      (p) => p.id === provinceId,
    );
    if (!province) throw invalid('provinceId', 'Tỉnh/thành không hợp lệ.');
    const district = (
      await this.get<{ id: number; name: string }>(`/locations/provinces/${provinceId}/districts`)
    ).find((d) => d.id === districtId);
    if (!district) throw invalid('districtId', 'Quận/huyện không thuộc tỉnh/thành đã chọn.');
    const ward = (
      await this.get<{ code: string; name: string }>(`/locations/districts/${districtId}/wards`)
    ).find((w) => w.code === wardCode);
    if (!ward) throw invalid('wardCode', 'Phường/xã không thuộc quận/huyện đã chọn.');
    return { provinceName: province.name, districtName: district.name, wardName: ward.name };
  }

  private async get<T>(path: string): Promise<T[]> {
    try {
      const res = await fetch(`${this.config.marketplaceApiUrl}${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 404) return [];
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T[];
    } catch (e) {
      this.logger.error(`Không gọi được marketplace ${path}: ${(e as Error).message}`);
      throw new AppError(
        503,
        'LOCATION_SERVICE_UNAVAILABLE',
        'Chưa kiểm được tỉnh/huyện/xã, bạn thử lại sau ít phút.',
      );
    }
  }
}

function invalid(field: string, message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'Dữ liệu chưa hợp lệ.', {
    fields: { [field]: message },
  });
}
