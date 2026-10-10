import { Global, Module } from '@nestjs/common';
import { CheckoutController } from '../checkout/checkout.controller';
import { CheckoutService } from '../checkout/checkout.service';
import { ShippingFeeService } from '../checkout/shipping-fee.service';
import { PaymentClient } from '../clients/payment.client';
import { UserClient } from '../clients/user.client';
import { LocationsModule } from '../locations/locations.module';
import { OrderEvents } from './order.events';
import { OrderJobs } from './order.jobs';
import { OrderLifecycle } from './order-lifecycle.service';
import {
  AdminOrdersController,
  BuyerOrdersController,
  SellerOrdersController,
} from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * Checkout và đơn hàng (P3: ORD-01..05, INV-02, VCH-02/03, SHIP-01). OrderLifecycle dùng chung cho
 * module khác (đình chỉ shop thì hủy đơn) nên module này là Global.
 */
@Global()
@Module({
  imports: [LocationsModule],
  controllers: [
    CheckoutController,
    BuyerOrdersController,
    SellerOrdersController,
    AdminOrdersController,
  ],
  providers: [
    CheckoutService,
    ShippingFeeService,
    UserClient,
    PaymentClient,
    OrdersService,
    OrderLifecycle,
    OrderEvents,
    OrderJobs,
  ],
  exports: [OrderLifecycle],
})
export class OrdersModule {}
