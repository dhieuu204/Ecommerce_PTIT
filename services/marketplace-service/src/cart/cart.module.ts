import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

/** Giỏ hàng (CRT-01) */
@Module({
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
