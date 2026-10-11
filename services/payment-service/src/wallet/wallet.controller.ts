import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { CurrentUser, PageQuery, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { IsIn, IsOptional } from 'class-validator';
import {
  SellerWalletService,
  type EarningView,
  type WalletTransactionView,
  type WalletView,
} from './seller-wallet.service';

export const EARNING_STATUSES = [
  'UNPAID',
  'HELD',
  'AVAILABLE',
  'EXPIRED',
  'CANCELLED',
  'FAILED',
  'COMPENSATED',
] as const;

export class EarningsQuery extends PageQuery {
  @ApiPropertyOptional({ enum: EARNING_STATUSES })
  @IsOptional()
  @IsIn(EARNING_STATUSES, { message: 'Trạng thái không hợp lệ.' })
  status?: (typeof EARNING_STATUSES)[number];
}

/**
 * Ví của shop người gọi (FIN-01, FIN-02). Nhận ra shop qua chủ shop lưu từ `order.placed`,
 * nên seller chỉ xem được ví của chính mình.
 */
@ApiTags('Ví seller')
@ApiBearerAuth()
@Controller('shops/me')
export class WalletController {
  constructor(private readonly wallets: SellerWalletService) {}

  /** Số dư 3 ngăn: đang giữ, khả dụng, đang khóa (P5); chưa có đơn nào thì trả số 0 */
  @Get('wallet')
  wallet(@CurrentUser() user: AuthUser): Promise<WalletView> {
    return this.wallets.wallet(user);
  }

  /** Lịch sử biến động ví, mới nhất trước */
  @Get('wallet/transactions')
  transactions(
    @CurrentUser() user: AuthUser,
    @Query() q: PageQuery,
  ): Promise<Page<WalletTransactionView>> {
    return this.wallets.transactions(user, q);
  }

  /** Tiền từng đơn con: tiền hàng, phí sàn, seller nhận, trạng thái, lý do chưa khả dụng */
  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser, @Query() q: EarningsQuery): Promise<Page<EarningView>> {
    return this.wallets.earnings(user, q);
  }
}
