import { Module } from '@nestjs/common';
import { FollowsController } from './follows.controller';
import { FollowsService } from './follows.service';

/** Theo dõi shop, thả tim sản phẩm (ENG-03) */
@Module({
  controllers: [FollowsController],
  providers: [FollowsService],
})
export class FollowsModule {}
