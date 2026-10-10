import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '@san/nest-common';
import { GhnClient } from '../locations/ghn.client';
import { MarketSetting } from '../settings';

export type ShippingFeeSource = 'GHN' | 'FALLBACK' | 'FIXED';

export interface ShippingQuote {
  fee: number;
  /** GHN: giá thật; FALLBACK: GHN lỗi, dùng phí dự phòng; FIXED: chưa nối GHN */
  source: ShippingFeeSource;
}

export interface ShippingRoute {
  fromDistrictId: number;
  fromWardCode: string;
  toDistrictId: number;
  toWardCode: string;
  weight: number;
}

/**
 * Phí ship của một đơn con (SHIP-01, quyết định P3 số 3). Có GHN_TOKEN thì hỏi GHN; GHN lỗi thì dùng phí
 * dự phòng (sàn chịu chênh lệch). Chưa có token thì dùng phí cố định trong cấu hình.
 */
@Injectable()
export class ShippingFeeService {
  private readonly logger = new Logger(ShippingFeeService.name);

  constructor(
    private readonly ghn: GhnClient,
    private readonly settings: SettingsService,
  ) {}

  async quote(route: ShippingRoute): Promise<ShippingQuote> {
    const fixed = await this.settings.get(MarketSetting.shippingFixedFee);
    if (!this.ghn.configured) return { fee: fixed, source: 'FIXED' };
    try {
      return { fee: await this.ghn.fee(route), source: 'GHN' };
    } catch (e) {
      this.logger.warn(`GHN tính phí lỗi, dùng phí dự phòng: ${(e as Error).message}`);
      return { fee: fixed, source: 'FALLBACK' };
    }
  }
}
