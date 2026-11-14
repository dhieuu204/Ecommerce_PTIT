import { Body, Controller, Get, Headers, HttpCode, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  PageQuery,
  Public,
  RequirePermissions,
  type AuthUser,
} from '@san/nest-common';
import type { Page } from '@san/shared';
import { ReportRangeQuery } from '../reports/dto/report-range.query';
import { idempotencyHeader, requireKey } from '../shops/shops.controller';
import {
  AffiliatePortalService,
  type AffiliateOrderRow,
  type AffiliateProduct,
  type AffiliateStats,
  type SellerAffiliateOrderRow,
} from './affiliate-portal.service';
import {
  AffiliatesService,
  type AdminAffiliateRow,
  type AffiliateClickResult,
  type MyAffiliate,
} from './affiliates.service';
import {
  AdminAffiliatesQuery,
  AffiliateApplicationDto,
  AffiliateBankAccountDto,
  AffiliateClickDto,
  AffiliateProductsQuery,
  ProductCommissionDto,
} from './dto/affiliate.dto';

/** Cộng tác viên của tôi: đăng ký, tài khoản nhận tiền, thống kê, đơn (AFF-01, AFF-05, AFF-06) */
@ApiTags('Cộng tác viên')
@ApiBearerAuth()
@Controller('affiliates/me')
export class MyAffiliateController {
  constructor(
    private readonly affiliates: AffiliatesService,
    private readonly portal: AffiliatePortalService,
  ) {}

  /** Hồ sơ CTV: status NONE khi chưa đăng ký. Có đủ số tài khoản (chỉ chủ hồ sơ xem) */
  @Get()
  me(@CurrentUser() user: AuthUser): Promise<MyAffiliate> {
    return this.affiliates.me(user.id);
  }

  /** Nộp hồ sơ lần đầu hoặc nộp lại sau khi bị từ chối (AFF-01) */
  @Post('application')
  @HttpCode(201)
  @idempotencyHeader
  @ApiResponse({
    status: 409,
    description: 'AFFILIATE_APPLICATION_NOT_ALLOWED: đang chờ duyệt, đã là CTV hoặc đang bị khóa',
  })
  submit(
    @CurrentUser() user: AuthUser,
    @Body() dto: AffiliateApplicationDto,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<MyAffiliate> {
    return this.affiliates.submit(user, dto, requireKey(key));
  }

  /** Đổi tài khoản nhận tiền, không cần duyệt lại (AFF-05) */
  @Patch('bank-account')
  @ApiResponse({
    status: 409,
    description: 'AFFILIATE_NOT_ACTIVE; WITHDRAWAL_IN_PROGRESS: đang có yêu cầu rút chưa xong',
  })
  @ApiResponse({ status: 503, description: 'PAYMENT_SERVICE_UNAVAILABLE' })
  updateBankAccount(
    @CurrentUser() user: AuthUser,
    @Headers('authorization') authorization: string,
    @Body() dto: AffiliateBankAccountDto,
  ): Promise<MyAffiliate> {
    return this.affiliates.updateBankAccount(user, authorization, dto);
  }

  /** Lượt bấm, số đơn, hoa hồng theo ngày (AFF-06). Khoảng ngày như trang báo cáo */
  @Get('stats')
  @ApiResponse({ status: 400, description: 'INVALID_RANGE' })
  @ApiResponse({ status: 409, description: 'AFFILIATE_NOT_ACTIVE' })
  stats(@CurrentUser() user: AuthUser, @Query() q: ReportRangeQuery): Promise<AffiliateStats> {
    return this.portal.stats(user.id, q);
  }

  /** Đơn con gắn với mình, không có thông tin người mua (AFF-06) */
  @Get('orders')
  orders(@CurrentUser() user: AuthUser, @Query() q: PageQuery): Promise<Page<AffiliateOrderRow>> {
    return this.portal.orders(user.id, q);
  }
}

/** Sản phẩm có hoa hồng và lượt bấm link tiếp thị (AFF-03) */
@ApiTags('Cộng tác viên')
@Controller()
export class AffiliateLinksController {
  constructor(
    private readonly affiliates: AffiliatesService,
    private readonly portal: AffiliatePortalService,
  ) {}

  /** Sản phẩm đang bán có bật hoa hồng, bỏ hàng của shop mình */
  @Get('affiliate-products')
  @ApiBearerAuth()
  @ApiResponse({ status: 409, description: 'AFFILIATE_NOT_ACTIVE' })
  products(
    @CurrentUser() user: AuthUser,
    @Query() q: AffiliateProductsQuery,
  ): Promise<Page<AffiliateProduct>> {
    return this.portal.products(user.id, q);
  }

  /**
   * Ghi lượt bấm khi người mua mở link có `?aff=` (công khai; đang đăng nhập thì gắn tài khoản). Web giữ
   * `clickId` theo shop và gửi kèm khi đặt hàng
   */
  @Post('affiliate-clicks')
  @Public()
  @HttpCode(201)
  @ApiResponse({ status: 404, description: 'AFFILIATE_LINK_INVALID: web bỏ qua, không báo lỗi' })
  click(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: AffiliateClickDto,
  ): Promise<AffiliateClickResult> {
    return this.affiliates.recordClick(dto, user);
  }
}

/** Hoa hồng cộng tác viên của shop (AFF-02, AFF-06) */
@ApiTags('Cộng tác viên')
@ApiBearerAuth()
@Controller('shops/me')
export class SellerAffiliateController {
  constructor(private readonly portal: AffiliatePortalService) {}

  /** Khoảng % hoa hồng sàn cho phép (phần vạn) */
  @Get('affiliate-settings')
  settings(): Promise<{ min: number; max: number }> {
    return this.portal.rateRange();
  }

  /** Bật, đổi hoặc tắt (`rate: null`) hoa hồng cho 1–100 sản phẩm. Chỉ áp cho đơn đặt sau đó */
  @Put('product-commissions')
  @ApiResponse({ status: 400, description: 'VALIDATION_ERROR: % ngoài khoảng sàn cho phép' })
  @ApiResponse({ status: 404, description: 'NOT_FOUND: có sản phẩm không thuộc shop' })
  @ApiResponse({ status: 409, description: 'SHOP_NOT_ACTIVE' })
  setCommission(
    @CurrentUser() user: AuthUser,
    @Body() dto: ProductCommissionDto,
  ): Promise<{ updated: number }> {
    return this.portal.setCommission(user.id, dto);
  }

  /** Đơn qua CTV của shop, kèm hoa hồng phải trả */
  @Get('affiliate-orders')
  orders(
    @CurrentUser() user: AuthUser,
    @Query() q: PageQuery,
  ): Promise<Page<SellerAffiliateOrderRow>> {
    return this.portal.sellerOrders(user.id, q);
  }
}

/** Danh sách cộng tác viên của admin Kiểm duyệt (AFF-01). Duyệt và khóa/mở ở approval-service */
@ApiTags('Quản trị: cộng tác viên')
@ApiBearerAuth()
@RequirePermissions('MODERATION')
@Controller('admin/affiliates')
export class AdminAffiliatesController {
  constructor(private readonly affiliates: AffiliatesService) {}

  @Get()
  list(@Query() q: AdminAffiliatesQuery): Promise<Page<AdminAffiliateRow>> {
    return this.affiliates.adminList(q);
  }
}
