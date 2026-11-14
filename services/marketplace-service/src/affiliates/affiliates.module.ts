import { Module } from '@nestjs/common';
import { PaymentClient } from '../clients/payment.client';
import { AffiliatePortalService } from './affiliate-portal.service';
import {
  AdminAffiliatesController,
  AffiliateLinksController,
  MyAffiliateController,
  SellerAffiliateController,
} from './affiliates.controller';
import { AffiliatesService } from './affiliates.service';

/**
 * Cộng tác viên bán hàng (P7: AFF-01..06). Gắn đơn và tính hoa hồng nằm ở CheckoutService (cùng giao dịch
 * tạo đơn), hàm tính ở `commission.ts`.
 */
@Module({
  controllers: [
    MyAffiliateController,
    AffiliateLinksController,
    SellerAffiliateController,
    AdminAffiliatesController,
  ],
  providers: [AffiliatesService, AffiliatePortalService, PaymentClient],
})
export class AffiliatesModule {}
