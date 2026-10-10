import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import { AppConfig } from '../config';

/** Một địa chỉ trong sổ địa chỉ của buyer (user-service) */
export interface BuyerAddress {
  id: string;
  receiverName: string;
  phone: string;
  provinceId: number;
  districtId: number;
  wardCode: string;
  provinceName: string;
  districtName: string;
  wardName: string;
  street: string;
  isDefault: boolean;
}

/**
 * Gọi REST của user-service (chủ dữ liệu sổ địa chỉ) bằng vé đăng nhập của chính buyer,
 * nên user-service tự kiểm đó là địa chỉ của người đang đặt hàng.
 */
@Injectable()
export class UserClient {
  private readonly logger = new Logger(UserClient.name);

  constructor(private readonly config: AppConfig) {}

  async addresses(authorization: string): Promise<BuyerAddress[]> {
    try {
      const res = await fetch(`${this.config.userApiUrl}/me/addresses`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as BuyerAddress[];
    } catch (e) {
      this.logger.error(`Không lấy được sổ địa chỉ: ${(e as Error).message}`);
      throw new AppError(
        503,
        'USER_SERVICE_UNAVAILABLE',
        'Chưa lấy được sổ địa chỉ, bạn thử lại sau ít phút.',
      );
    }
  }
}
