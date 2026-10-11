import { Logger, Module } from '@nestjs/common';
import { AppConfig } from '../config';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../gateway/gateway';
import { MockGateway } from '../gateway/mock.gateway';
import { VnpayGateway } from '../gateway/vnpay.gateway';
import { ReceiptStorage } from '../refunds/receipt-storage.service';
import { RefundsController } from '../refunds/refunds.controller';
import { RefundsService } from '../refunds/refunds.service';
import { CodReconciliationService } from '../reconciliation/cod-reconciliation.service';
import { ReconciliationController } from '../reconciliation/reconciliation.controller';
import { VnpayReconciliationService } from '../reconciliation/vnpay-reconciliation.service';
import { SellerWalletService } from '../wallet/seller-wallet.service';
import { WalletController } from '../wallet/wallet.controller';
import { WalletService } from '../wallet/wallet.service';
import { CallbacksService } from './callbacks.service';
import { PaymentOrderEvents } from './order.events';
import { PaymentJobs } from './payment.jobs';
import { AdminPaymentsController, PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/** Thu tiền VNPay, hoàn tiền (P3: PAY-01..04, REF-01, FIN-03), ví seller và đối soát (P4: FIN-01/02, COD-02, PAY-05) */
@Module({
  controllers: [
    PaymentsController,
    AdminPaymentsController,
    RefundsController,
    WalletController,
    ReconciliationController,
  ],
  providers: [
    {
      // Có khóa VNPay trong .env → sandbox; chưa có → cổng MÔ PHỎNG
      provide: PAYMENT_GATEWAY,
      inject: [AppConfig],
      useFactory: (config: AppConfig): PaymentGateway => {
        const logger = new Logger('Cổng thanh toán');
        if (config.vnpayConfigured) {
          logger.log('Dùng VNPay sandbox.');
          return new VnpayGateway(config);
        }
        logger.warn(
          'Chưa có VNPAY_TMN_CODE/VNPAY_HASH_SECRET: dùng cổng MÔ PHỎNG, không có tiền thật.',
        );
        return new MockGateway(config);
      },
    },
    PaymentsService,
    CallbacksService,
    RefundsService,
    ReceiptStorage,
    PaymentOrderEvents,
    PaymentJobs,
    WalletService,
    SellerWalletService,
    CodReconciliationService,
    VnpayReconciliationService,
  ],
})
export class PaymentsModule {}
