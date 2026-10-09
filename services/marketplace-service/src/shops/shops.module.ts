import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';

/** Mở shop, hồ sơ shop, nhận quyết định duyệt (SHP-01..03) */
@Module({
  imports: [LocationsModule, UploadsModule],
  controllers: [ShopsController],
  providers: [ShopsService],
})
export class ShopsModule {}
