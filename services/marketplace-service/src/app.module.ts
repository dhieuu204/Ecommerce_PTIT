import { Module } from '@nestjs/common';
import { SanCommonModule, SettingsModule } from '@san/nest-common';
import { MARKET_SETTINGS } from './settings';
import { OrdersModule } from './orders/orders.module';
import { CoreModule } from './core.module';
import { HealthController } from './health/health.controller';
import { LocationsModule } from './locations/locations.module';
import { PrismaService } from './prisma.service';
import { ShopsModule } from './shops/shops.module';
import { UploadsModule } from './uploads/uploads.module';
import { CartModule } from './cart/cart.module';
import { ShopAdminModule } from './shop-admin/shop-admin.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CatalogModule } from './catalog/catalog.module';
import { ReturnsModule } from './returns/returns.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ReviewsModule } from './reviews/reviews.module';
import { FollowsModule } from './follows/follows.module';

// Mỗi nhóm nghiệp vụ là một module riêng trong src/<ten-module>/ (xem CLAUDE.md, mục Quy ước code).
@Module({
  imports: [
    // Nền tảng chung: kiểm đăng nhập/quyền, dạng lỗi, sự kiện, PrismaService (packages/nest-common)
    SanCommonModule.forRoot({
      service: 'marketplace-service',
      prisma: PrismaService,
      rabbitmqUrl: process.env.RABBITMQ_URL,
      jwksUrl: process.env.JWKS_URL,
      databaseUrl: process.env.DATABASE_URL,
    }),
    // Cấu hình có phiên bản (bảng settings) + API /admin/settings (ADM-01)
    SettingsModule.forRoot(MARKET_SETTINGS),
    CoreModule,
    NotificationsModule,
    LocationsModule,
    OrdersModule,
    ReturnsModule,
    UploadsModule,
    ShopsModule,
    ShopAdminModule,
    CartModule,
    VouchersModule,
    CategoriesModule,
    ProductsModule,
    // Sau ShopsModule: GET /shops/{shopId} (công khai) không được che GET /shops/me
    CatalogModule,
    // P6: đánh giá (ENG-01, ENG-02), theo dõi shop và thả tim (ENG-03)
    ReviewsModule,
    FollowsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
