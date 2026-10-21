import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { ChatImagesController, ConversationsController } from './chat.controller';
import { ChatService } from './chat.service';

/** Chat người mua với shop (P6, MSG-01) */
@Module({
  imports: [UploadsModule],
  controllers: [ConversationsController, ChatImagesController],
  providers: [ChatService],
})
export class ChatModule {}
