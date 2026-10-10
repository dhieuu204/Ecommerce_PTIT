import { Module } from '@nestjs/common';
import { SanCommonModule } from '@san/nest-common';
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
    CoreModule,
    LocationsModule,
    UploadsModule,
    ShopsModule,
    ShopAdminModule,
    CartModule,
    VouchersModule,
    CategoriesModule,
    ProductsModule,
    // Sau ShopsModule: GET /shops/{shopId} (công khai) không được che GET /shops/me
    CatalogModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
