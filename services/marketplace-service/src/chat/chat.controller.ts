import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError, CurrentUser, ParseIdPipe, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { randomUUID } from 'node:crypto';
import { AppConfig } from '../config';
import { detectImageType } from '../uploads/image-type';
import { StorageService } from '../uploads/storage.service';
import { chatImagePrefix, ChatService } from './chat.service';
import {
  ChatImageQuery,
  ConversationsQuery,
  ConversationView,
  MessagesPage,
  MessagesQuery,
  MessageView,
  OpenConversationDto,
  SendMessageDto,
  UnreadChatView,
} from './dto/chat.dto';

const notFound = ApiResponse({
  status: 404,
  description: 'NOT_FOUND: không có hoặc bạn không phải người trong cuộc trò chuyện',
});

/** Giới hạn cứng khi nhận file, lớn hơn mức cho phép để còn trả câu báo lỗi tiếng Việt */
const HARD_LIMIT_BYTES = 10 * 1024 * 1024;

/** Chat người mua với shop (MSG-01): người mua mở chat, shop trả lời */
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly chat: ChatService) {}

  /** Mở cuộc trò chuyện với shop (đã có thì trả lại cuộc cũ) */
  @Post()
  @HttpCode(200)
  @ApiResponse({ status: 404, description: 'NOT_FOUND: shop chưa được duyệt' })
  @ApiResponse({ status: 409, description: 'OWN_SHOP: shop của chính bạn' })
  open(@CurrentUser() user: AuthUser, @Body() dto: OpenConversationDto): Promise<ConversationView> {
    return this.chat.open(user, dto.shopId);
  }

  /** Cuộc trò chuyện của tôi ở vai người mua (BUYER) hoặc shop (SHOP), tin mới nhất trước */
  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query() q: ConversationsQuery,
  ): Promise<Page<ConversationView>> {
    return this.chat.list(user, q);
  }

  /** Tổng tin chưa đọc ở vai người mua và vai shop */
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser): Promise<UnreadChatView> {
    return this.chat.unreadCount(user);
  }

  @Get(':conversationId')
  @notFound
  detail(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseIdPipe) id: string,
  ): Promise<ConversationView> {
    return this.chat.detail(user, id);
  }

  /** Các tin cũ hơn `before` (mặc định: mới nhất), theo thứ tự thời gian */
  @Get(':conversationId/messages')
  @notFound
  messages(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseIdPipe) id: string,
    @Query() q: MessagesQuery,
  ): Promise<MessagesPage> {
    return this.chat.messages(user, id, q);
  }

  /** Gửi tin: chữ, ảnh (khóa đã tải lên), thẻ sản phẩm hoặc thẻ đơn. Cùng `clientKey` → trả tin cũ */
  @Post(':conversationId/messages')
  @HttpCode(201)
  @ApiResponse({ status: 400, description: 'INVALID_MESSAGE, VALIDATION_ERROR' })
  @ApiResponse({ status: 409, description: 'IDEMPOTENCY_KEY_REUSED' })
  @notFound
  send(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseIdPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<MessageView> {
    return this.chat.send(user, id, dto);
  }

  /** Đánh dấu đã đọc hết ở vai của mình */
  @Post(':conversationId/read')
  @HttpCode(200)
  @notFound
  read(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseIdPipe) id: string,
  ): Promise<ConversationView> {
    return this.chat.read(user, id);
  }
}

/** Ảnh chat (bucket riêng tư): tải lên và xem lại, chỉ hai bên của cuộc trò chuyện */
@ApiTags('Chat')
@ApiBearerAuth()
@Controller()
export class ChatImagesController {
  private readonly logger = new Logger(ChatImagesController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly storage: StorageService,
    private readonly config: AppConfig,
  ) {}

  /** Tải ảnh để gửi trong chat: JPG/PNG/WebP, tối đa CHAT_IMAGE_MAX_MB. Trả khóa ảnh để gửi tin IMAGE */
  @Post('uploads/chat-image')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 400, description: 'FILE_REQUIRED, INVALID_IMAGE hoặc FILE_TOO_LARGE' })
  @ApiResponse({ status: 503, description: 'STORAGE_UNAVAILABLE: chưa lưu được ảnh' })
  @notFound
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: HARD_LIMIT_BYTES, files: 1 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @Query() q: ChatImageQuery,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ key: string }> {
    await this.chat.party(user.id, q.conversationId);
    const maxMb = this.config.chatImageMaxMb;
    if (!file) throw new AppError(400, 'FILE_REQUIRED', 'Vui lòng chọn ảnh.');
    if (file.size > maxMb * 1024 * 1024) {
      throw new AppError(400, 'FILE_TOO_LARGE', `Ảnh tối đa ${maxMb} MB.`);
    }
    const type = detectImageType(file.buffer);
    if (!type) throw new AppError(400, 'INVALID_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    const key = `${chatImagePrefix(q.conversationId)}${randomUUID()}.${type.ext}`;
    try {
      await this.storage.putPrivate(key, file.buffer, type.mime);
    } catch (e) {
      this.logger.error(`Không lưu được ảnh chat vào MinIO: ${(e as Error).message}`);
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Chưa lưu được ảnh, bạn thử lại sau ít phút.');
    }
    return { key };
  }

  /** Xem ảnh chat; người không ở trong cuộc trò chuyện → 404 */
  @Get('chat-images/:conversationId/:file')
  @ApiResponse({ status: 404, description: 'NOT_FOUND: không có hoặc không được xem' })
  async image(
    @CurrentUser() user: AuthUser,
    @Param('conversationId', ParseIdPipe) conversationId: string,
    @Param('file') file: string,
  ): Promise<StreamableFile> {
    const key = await this.chat.imageKey(user.id, conversationId, file);
    const ext = key.split('.').pop();
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    try {
      return new StreamableFile(await this.storage.getPrivate(key), { type });
    } catch (e) {
      this.logger.warn(`Không đọc được ảnh chat ${key}: ${(e as Error).message}`);
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    }
  }
}
