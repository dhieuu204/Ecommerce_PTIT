import { Global, Logger, Module } from '@nestjs/common';
import { CheckoutController } from '../checkout/checkout.controller';
import { CheckoutService } from '../checkout/checkout.service';
import { ShippingFeeService } from '../checkout/shipping-fee.service';
import { PaymentClient } from '../clients/payment.client';
import { UserClient } from '../clients/user.client';
import { AppConfig } from '../config';
import { LocationsModule } from '../locations/locations.module';
import { SHIPPING_CARRIER, type ShippingCarrier } from '../shipping/carrier';
import { GhnCarrier } from '../shipping/ghn.carrier';
import { MockCarrier } from '../shipping/mock.carrier';
import { ShipmentsService } from '../shipping/shipments.service';
import { CarrierSimulatorController, GhnWebhookController } from '../shipping/shipping.controller';
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
 * Checkout, đơn hàng và vận chuyển (P3–P4: ORD-01..05, INV-02, VCH-02/03, SHIP-01..04, COD-01).
 * OrderLifecycle dùng chung cho module khác (đình chỉ shop thì hủy đơn) nên module này là Global.
 */
@Global()
@Module({
  imports: [LocationsModule],
  controllers: [
    CheckoutController,
    BuyerOrdersController,
    SellerOrdersController,
    AdminOrdersController,
    GhnWebhookController,
    CarrierSimulatorController,
  ],
  providers: [
    {
      // Có GHN_TOKEN → GHN môi trường dev; chưa có → đơn vị vận chuyển MÔ PHỎNG
      provide: SHIPPING_CARRIER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): ShippingCarrier => {
        const logger = new Logger('Vận chuyển');
        if (config.ghnToken) {
          logger.log('Dùng GHN môi trường dev.');
          return new GhnCarrier(config);
        }
        logger.warn('Chưa có GHN_TOKEN: dùng vận chuyển MÔ PHỎNG (admin bấm các mốc giao hàng).');
        return new MockCarrier();
      },
    },
    CheckoutService,
    ShippingFeeService,
    UserClient,
    PaymentClient,
    OrdersService,
    OrderLifecycle,
    ShipmentsService,
    OrderEvents,
    OrderJobs,
  ],
  exports: [OrderLifecycle],
})
export class OrdersModule {}
