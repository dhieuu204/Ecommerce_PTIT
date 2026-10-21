import { Global, Module } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

/** Socket.IO (P6): module nào cũng inject được RealtimeGateway để đẩy tin tới người dùng */
@Global()
@Module({
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
