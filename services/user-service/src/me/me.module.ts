import { Module } from '@nestjs/common';
import { AddressController } from '../addresses/address.controller';
import { AddressService } from '../addresses/address.service';
import { LocationsClient } from '../addresses/locations.client';
import { MeController } from './me.controller';
import { MeService } from './me.service';

/** Hồ sơ của tôi, đổi mật khẩu, sổ địa chỉ (ACC-03, ACC-04) */
@Module({
  controllers: [MeController, AddressController],
  providers: [MeService, AddressService, LocationsClient],
})
export class MeModule {}
