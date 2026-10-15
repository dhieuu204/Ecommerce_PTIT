import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  PageQuery,
  ParseIdPipe,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { IsIn, IsOptional } from 'class-validator';
import {
  SellerWalletService,
  type AdminWalletView,
  type EarningView,
  type ShopOrderMoneyView,
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
  'REFUNDED',
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

  /**
   * Số dư 3 ngăn: đang giữ, khả dụng, đang khóa; kèm số rút tối thiểu và yêu cầu rút đang xử lý.
   * Chưa có đơn nào thì trả số 0
   */
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

  /** Tiền từng đơn con: tiền hàng, phí sàn, seller nhận, trừ do trả hàng, trạng thái, lý do chưa khả dụng */
  @Get('earnings')
  earnings(@CurrentUser() user: AuthUser, @Query() q: EarningsQuery): Promise<Page<EarningView>> {
    return this.wallets.earnings(user, q);
  }
}

/** Ví và tiền đơn con cho admin tài chính (FIN-05 nguồn tiền khi duyệt rút, DIS-02 lập điều chỉnh) */
@ApiTags('Admin: ví seller')
@ApiBearerAuth()
@RequirePermissions('FINANCE')
@Controller('admin')
export class AdminWalletController {
  constructor(private readonly wallets: SellerWalletService) {}

  /** Ví một shop và 20 biến động gần nhất */
  @Get('shops/:shopId/wallet')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop chưa có ví' })
  wallet(@Param('shopId', ParseIdPipe) shopId: string): Promise<AdminWalletView> {
    return this.wallets.adminWallet(shopId);
  }

  /** Tiền của một đơn con theo mã: người mua đã trả, đã hoàn, seller nhận, ví của shop */
  @Get('shop-orders/:shopOrderCode/money')
  @ApiResponse({ status: 404, description: 'NOT_FOUND' })
  money(@Param('shopOrderCode') code: string): Promise<ShopOrderMoneyView> {
    return this.wallets.adminShopOrderMoney(code);
  }
}
