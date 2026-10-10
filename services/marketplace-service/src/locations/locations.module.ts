import { Module } from '@nestjs/common';
import { GhnClient } from './ghn.client';
import { LocationsController } from './locations.controller';
import { LocationsService } from './locations.service';

@Module({
  controllers: [LocationsController],
  providers: [LocationsService, GhnClient],
  exports: [LocationsService, GhnClient],
})
export class LocationsModule {}
