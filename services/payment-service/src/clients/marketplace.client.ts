import { Injectable, Logger } from '@nestjs/common';
import { AppError } from '@san/nest-common';
import type { BankAccount, ErrorBody } from '@san/shared';
import { AppConfig } from '../config';

/** Shop của người gọi (phần dùng tới từ GET /shops/me của marketplace) */
export interface MyShopInfo {
  /** NONE: chưa nộp hồ sơ; ACTIVE: đang hoạt động; SUSPENDED: bị đình chỉ... */
  status: string;
  shop: { id: string; name: string | null; bankAccount: BankAccount | null } | null;
}

/**
 * Gọi marketplace-service lấy hồ sơ shop của seller (tài khoản ngân hàng đang dùng) khi seller rút tiền,
 * chuyển kèm vé đăng nhập của seller (mặc định ERD: marketplace giữ tài khoản ngân hàng trong hồ sơ shop).
 */
@Injectable()
export class MarketplaceClient {
  private readonly logger = new Logger(MarketplaceClient.name);

  constructor(private readonly config: AppConfig) {}

  async myShop(authorization: string): Promise<MyShopInfo> {
    let res: Response;
    try {
      res = await fetch(`${this.config.marketplaceApiUrl}/shops/me`, {
        headers: { Authorization: authorization },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      this.logger.error(`Không gọi được marketplace-service: ${(e as Error).message}`);
      throw unavailable();
    }
    if (res.ok) return (await res.json()) as MyShopInfo;
    if (res.status >= 400 && res.status < 500) {
      const err = (await res.json().catch(() => null)) as ErrorBody | null;
      if (err?.code) throw new AppError(res.status, err.code, err.message, err.details);
    }
    this.logger.error(`marketplace-service trả HTTP ${res.status}`);
    throw unavailable();
  }
}

function unavailable(): AppError {
  return new AppError(
    503,
    'MARKETPLACE_SERVICE_UNAVAILABLE',
    'Chưa lấy được thông tin shop, bạn thử lại sau ít phút.',
  );
}
