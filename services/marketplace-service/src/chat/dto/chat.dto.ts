import { ApiPropertyOptional } from '@nestjs/swagger';
import { PageQuery } from '@san/nest-common';
import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MESSAGE_TYPES = ['TEXT', 'IMAGE', 'PRODUCT', 'ORDER'] as const;
export type MessageTypeName = (typeof MESSAGE_TYPES)[number];
export type ChatRole = 'BUYER' | 'SHOP';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OpenConversationDto {
  /** Shop muốn chat */
  @IsUUID('all', { message: 'Shop không hợp lệ.' })
  shopId!: string;
}

export class ConversationsQuery extends PageQuery {
  /** BUYER: các shop mình đã chat; SHOP: người mua đã chat với shop mình */
  @ApiPropertyOptional({ enum: ['BUYER', 'SHOP'], default: 'BUYER' })
  @IsOptional()
  @IsIn(['BUYER', 'SHOP'], { message: 'role phải là BUYER hoặc SHOP.' })
  role: ChatRole = 'BUYER';
}

export class MessagesQuery {
  /** Mã tin: lấy các tin cũ hơn tin này */
  @IsOptional()
  @IsUUID('all', { message: 'before không hợp lệ.' })
  before?: string;

  /** Số tin tối đa (mặc định 30, tối đa 50) */
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit phải là số nguyên.' })
  @Min(1, { message: 'limit nhỏ nhất là 1.' })
  @Max(50, { message: 'limit lớn nhất là 50.' })
  limit: number = 30;
}

export class ChatImageQuery {
  /** Cuộc trò chuyện sẽ gửi ảnh */
  @IsUUID('all', { message: 'Cuộc trò chuyện không hợp lệ.' })
  conversationId!: string;
}

export class SendMessageDto {
  /** Mã do web sinh mỗi lần bấm gửi (UUID): gửi lại cùng mã thì trả tin cũ */
  @IsString({ message: 'Thiếu mã chống gửi lặp.' })
  @IsNotEmpty({ message: 'Thiếu mã chống gửi lặp.' })
  @MaxLength(64, { message: 'Mã chống gửi lặp dài tối đa 64 ký tự.' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: 'Mã chống gửi lặp không hợp lệ.' })
  clientKey!: string;

  @IsIn(MESSAGE_TYPES, { message: 'Loại tin nhắn không hợp lệ.' })
  type!: MessageTypeName;

  /** TEXT: 1–1000 ký tự */
  @IsOptional()
  @Transform(trim)
  @IsString({ message: 'Nội dung không hợp lệ.' })
  @MaxLength(1000, { message: 'Tin nhắn tối đa 1.000 ký tự.' })
  text?: string;

  /** IMAGE: khóa ảnh đã tải lên qua POST /uploads/chat-image cho cuộc này */
  @IsOptional()
  @IsString({ message: 'Ảnh không hợp lệ.' })
  @MaxLength(200)
  imageKey?: string;

  /** PRODUCT: sản phẩm đang bán */
  @IsOptional()
  @IsUUID('all', { message: 'Sản phẩm không hợp lệ.' })
  productId?: string;

  /** ORDER: đơn con của người mua ở shop này */
  @IsOptional()
  @IsUUID('all', { message: 'Đơn hàng không hợp lệ.' })
  shopOrderId?: string;
}

/** Thẻ sản phẩm chụp lại lúc gửi */
export class ProductCardView {
  kind!: 'PRODUCT';
  productId!: string;
  name!: string;
  image!: string | null;
  minPrice!: number;
  maxPrice!: number;
  shopName!: string;
}

/** Thẻ đơn hàng chụp lại lúc gửi */
export class OrderCardView {
  kind!: 'ORDER';
  shopOrderId!: string;
  orderId!: string;
  /** Mã đơn con */
  code!: string;
  /** Trạng thái đơn con lúc gửi */
  status!: string;
  total!: number;
  itemCount!: number;
  /** Ảnh và tên món đầu tiên */
  image!: string | null;
  firstItemName!: string;
  placedAt!: string;
}

export class MessageView {
  id!: string;
  conversationId!: string;
  senderRole!: ChatRole;
  type!: MessageTypeName;
  /** TEXT */
  text!: string | null;
  /** IMAGE: xem qua GET /{imageKey} (chat-images/<conversationId>/<file>, cần đăng nhập) */
  imageKey!: string | null;
  /** PRODUCT / ORDER */
  card!: ProductCardView | OrderCardView | null;
  clientKey!: string;
  createdAt!: Date;
}

export class MessagesPage {
  /** Theo thứ tự thời gian (cũ trước) */
  items!: MessageView[];
  /** Còn tin cũ hơn */
  hasMore!: boolean;
}

export class ConversationView {
  id!: string;
  /** Vai của người gọi trong cuộc này */
  role!: ChatRole;
  shop!: { id: string; name: string; logoUrl: string | null; suspended: boolean };
  buyer!: { id: string; name: string };
  lastMessageAt!: Date | null;
  lastMessagePreview!: string | null;
  /** Số tin chưa đọc của người gọi */
  unread!: number;
  /** Số tin bên kia chưa đọc (0 = bên kia đã xem hết) */
  otherUnread!: number;
  createdAt!: Date;
}

export class UnreadChatView {
  /** Tổng tin chưa đọc ở vai người mua */
  buyer!: number;
  /** Tổng tin chưa đọc ở vai shop (0 nếu chưa có shop) */
  shop!: number;
}
