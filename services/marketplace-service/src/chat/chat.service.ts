import { Injectable } from '@nestjs/common';
import { AppError, skipTake, toPage, type AuthUser } from '@san/nest-common';
import type { Page } from '@san/shared';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma.service';
import { sortImages } from '../products/products.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { Prisma, type Conversation, type Message, type Shop } from '../../generated/prisma';
import type {
  ChatRole,
  ConversationsQuery,
  ConversationView,
  MessagesPage,
  MessagesQuery,
  MessageView,
  OrderCardView,
  ProductCardView,
  SendMessageDto,
  UnreadChatView,
} from './dto/chat.dto';

type Tx = Prisma.TransactionClient;
type ConversationRow = Conversation & { shop: Shop };

/** Thư mục ảnh chat của một cuộc trò chuyện trong bucket riêng tư (MSG-01) */
export const chatImagePrefix = (conversationId: string) => `chat-images/${conversationId}/`;

const IMAGE_FILE = /^[0-9a-f-]{36}\.(jpg|png|webp)$/;

const notFound = () => new AppError(404, 'NOT_FOUND', 'Không tìm thấy cuộc trò chuyện.');
const invalid = (message: string) => new AppError(400, 'INVALID_MESSAGE', message);

/** Đường dẫn mở cuộc trò chuyện trên web, theo vai người nhận */
export const chatLink = (conversationId: string, role: ChatRole) =>
  role === 'BUYER' ? `/tin-nhan/${conversationId}` : `/kenh-nguoi-ban/tin-nhan/${conversationId}`;

const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * Chat người mua với shop (MSG-01, quyết định P6 số 5, 6, 8). Người mua mở chat, shop trả lời; admin không
 * đọc chat. Một người mua với một shop có đúng một cuộc trò chuyện. Gửi tin bằng REST (mã chống gửi lặp
 * `clientKey`), lưu xong mới đẩy `chat:message` qua Socket.IO. Chỉ hai bên đọc/gửi; người khác → 404.
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /** Mở cuộc trò chuyện với shop (đã có thì trả lại cuộc cũ) */
  async open(user: AuthUser, shopId: string): Promise<ConversationView> {
    const shop = await this.prisma.shop.findFirst({
      where: { id: shopId, status: { in: ['ACTIVE', 'SUSPENDED'] } },
    });
    if (!shop) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy shop.');
    if (shop.ownerId === user.id) {
      throw new AppError(409, 'OWN_SHOP', 'Bạn không thể chat với shop của chính mình.');
    }
    const where = { buyerId_shopId: { buyerId: user.id, shopId } };
    let conv = await this.prisma.conversation.findUnique({ where, include: { shop: true } });
    if (!conv) {
      try {
        conv = await this.prisma.conversation.create({
          data: { buyerId: user.id, buyerName: clip(user.name, 100), shopId },
          include: { shop: true },
        });
      } catch (e) {
        // Bấm hai lần cùng lúc: cuộc kia vừa được tạo
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
        conv = await this.prisma.conversation.findUniqueOrThrow({ where, include: { shop: true } });
      }
    }
    return conversationView(conv, 'BUYER');
  }

  async list(user: AuthUser, q: ConversationsQuery): Promise<Page<ConversationView>> {
    let where: Prisma.ConversationWhereInput;
    if (q.role === 'SHOP') {
      const shop = await this.prisma.shop.findUnique({ where: { ownerId: user.id } });
      if (!shop) return toPage([], 0, q);
      // Shop chỉ thấy cuộc đã có tin (người mua mở chat mà chưa gửi gì thì shop chưa thấy)
      where = { shopId: shop.id, lastMessageAt: { not: null } };
    } else {
      where = { buyerId: user.id };
    }
    const [rows, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: { shop: true },
        orderBy: [
          { lastMessageAt: { sort: 'desc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        ...skipTake(q),
      }),
      this.prisma.conversation.count({ where }),
    ]);
    return toPage(
      rows.map((c) => conversationView(c, q.role)),
      total,
      q,
    );
  }

  async unreadCount(user: AuthUser): Promise<UnreadChatView> {
    const [buyer, shop] = await Promise.all([
      this.prisma.conversation.aggregate({
        where: { buyerId: user.id },
        _sum: { buyerUnread: true },
      }),
      this.prisma.conversation.aggregate({
        where: { shop: { ownerId: user.id } },
        _sum: { shopUnread: true },
      }),
    ]);
    return { buyer: buyer._sum.buyerUnread ?? 0, shop: shop._sum.shopUnread ?? 0 };
  }

  async detail(user: AuthUser, conversationId: string): Promise<ConversationView> {
    const { conv, role } = await this.party(user.id, conversationId);
    return conversationView(conv, role);
  }

  /** Các tin cũ hơn `before` (không có: tin mới nhất), trả theo thứ tự thời gian */
  async messages(user: AuthUser, conversationId: string, q: MessagesQuery): Promise<MessagesPage> {
    await this.party(user.id, conversationId);
    const where: Prisma.MessageWhereInput = { conversationId };
    if (q.before) {
      const b = await this.prisma.message.findFirst({ where: { id: q.before, conversationId } });
      if (!b) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy tin nhắn.');
      where.OR = [{ createdAt: { lt: b.createdAt } }, { createdAt: b.createdAt, id: { lt: b.id } }];
    }
    const rows = await this.prisma.message.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
    });
    const hasMore = rows.length > q.limit;
    return { items: rows.slice(0, q.limit).reverse().map(messageView), hasMore };
  }

  /**
   * Gửi tin. Gửi lại cùng `clientKey` → trả tin cũ, không tạo tác động mới. Tăng số chưa đọc của bên kia;
   * bên kia đang không có tin chưa đọc thì tạo một thông báo CHAT_MESSAGE (không báo từng tin). Lưu xong
   * mới đẩy `chat:message` cho cả hai bên.
   */
  async send(user: AuthUser, conversationId: string, dto: SendMessageDto): Promise<MessageView> {
    const { conv, role } = await this.party(user.id, conversationId);
    const replay = await this.findReplay(user.id, conversationId, dto.clientKey);
    if (replay) return messageView(replay);
    const built = await this.build(conv, dto);

    const result = await this.prisma.$transaction(async (tx) => {
      // Khóa cuộc trò chuyện: hai tin cùng lúc đếm chưa đọc đúng, cùng clientKey chỉ tạo một tin
      await tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conversationId}::uuid FOR UPDATE`;
      const again = await tx.message.findUnique({
        where: { conversationId_clientKey: { conversationId, clientKey: dto.clientKey } },
      });
      if (again) return { message: again, fresh: false };
      const now = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      const message = await tx.message.create({
        data: {
          conversationId,
          senderId: user.id,
          senderRole: role,
          type: dto.type,
          content: built.content,
          card: built.card ? (built.card as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          clientKey: dto.clientKey,
        },
      });
      const otherBefore = role === 'BUYER' ? now.shopUnread : now.buyerUnread;
      await tx.conversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: message.createdAt,
          lastMessagePreview: clip(built.preview, 120),
          // Gửi tin nghĩa là đã đọc hết ở vai của mình
          ...(role === 'BUYER'
            ? { shopUnread: { increment: 1 }, buyerUnread: 0 }
            : { buyerUnread: { increment: 1 }, shopUnread: 0 }),
        },
      });
      if (otherBefore === 0) await this.notifyOther(tx, conv, role, built.preview);
      return { message, fresh: true };
    });

    const view = messageView(result.message);
    if (result.fresh) {
      for (const userId of [conv.buyerId, conv.shop.ownerId]) {
        this.realtime.emitToUser(userId, 'chat:message', { conversationId, message: view });
      }
    } else if (result.message.senderId !== user.id) {
      throw keyReused();
    }
    return view;
  }

  /** Đánh dấu đã đọc hết ở vai của mình; báo cả hai bên (`chat:read`) */
  async read(user: AuthUser, conversationId: string): Promise<ConversationView> {
    const { conv, role } = await this.party(user.id, conversationId);
    const { count } = await this.prisma.conversation.updateMany({
      where:
        role === 'BUYER'
          ? { id: conversationId, buyerUnread: { gt: 0 } }
          : { id: conversationId, shopUnread: { gt: 0 } },
      data: role === 'BUYER' ? { buyerUnread: 0 } : { shopUnread: 0 },
    });
    // Thông báo "có tin nhắn mới" của cuộc này cũng coi như đã đọc
    await this.prisma.notification.updateMany({
      where: {
        userId: user.id,
        type: 'CHAT_MESSAGE',
        link: chatLink(conversationId, role),
        readAt: null,
      },
      data: { readAt: new Date() },
    });
    if (count > 0) {
      for (const userId of [conv.buyerId, conv.shop.ownerId]) {
        this.realtime.emitToUser(userId, 'chat:read', { conversationId, role });
      }
    }
    return this.detail(user, conversationId);
  }

  /** Người gọi là người mua hoặc chủ shop của cuộc trò chuyện; người khác → 404 */
  async party(
    userId: string,
    conversationId: string,
  ): Promise<{ conv: ConversationRow; role: ChatRole }> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { shop: true },
    });
    if (!conv) throw notFound();
    if (conv.buyerId === userId) return { conv, role: 'BUYER' };
    if (conv.shop.ownerId === userId) return { conv, role: 'SHOP' };
    throw notFound();
  }

  /** Khóa ảnh chat để xem lại: chỉ hai bên của cuộc trò chuyện */
  async imageKey(userId: string, conversationId: string, file: string): Promise<string> {
    if (!IMAGE_FILE.test(file)) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    try {
      await this.party(userId, conversationId);
    } catch {
      throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy ảnh.');
    }
    return `${chatImagePrefix(conversationId)}${file}`;
  }

  // ----- phần dùng chung -----

  private async findReplay(
    userId: string,
    conversationId: string,
    clientKey: string,
  ): Promise<Message | null> {
    const m = await this.prisma.message.findUnique({
      where: { conversationId_clientKey: { conversationId, clientKey } },
    });
    if (m && m.senderId !== userId) throw keyReused();
    return m;
  }

  /** Kiểm nội dung theo loại tin, chụp lại thẻ sản phẩm/đơn lúc gửi */
  private async build(
    conv: ConversationRow,
    dto: SendMessageDto,
  ): Promise<{ content: string; card: ProductCardView | OrderCardView | null; preview: string }> {
    switch (dto.type) {
      case 'TEXT': {
        const text = dto.text ?? '';
        if (!text) throw invalid('Vui lòng nhập nội dung tin nhắn.');
        return { content: text, card: null, preview: text.replace(/\s+/g, ' ') };
      }
      case 'IMAGE': {
        const key = dto.imageKey ?? '';
        const prefix = chatImagePrefix(conv.id);
        if (!key.startsWith(prefix) || !IMAGE_FILE.test(key.slice(prefix.length))) {
          throw invalid('Ảnh không hợp lệ, bạn tải ảnh lên lại nhé.');
        }
        return { content: key, card: null, preview: '[Hình ảnh]' };
      }
      case 'PRODUCT': {
        if (!dto.productId) throw invalid('Vui lòng chọn sản phẩm.');
        const p = await this.prisma.product.findFirst({
          where: { id: dto.productId, status: 'ACTIVE', shop: { status: 'ACTIVE' } },
          include: { images: true, shop: { select: { name: true } } },
        });
        if (!p) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy sản phẩm.');
        const card: ProductCardView = {
          kind: 'PRODUCT',
          productId: p.id,
          name: p.name,
          image: sortImages(p.images)[0]?.url ?? null,
          minPrice: p.minPrice,
          maxPrice: p.maxPrice,
          shopName: p.shop.name ?? '',
        };
        return { content: p.id, card, preview: `[Sản phẩm] ${p.name}` };
      }
      case 'ORDER': {
        if (!dto.shopOrderId) throw invalid('Vui lòng chọn đơn hàng.');
        // Chỉ đơn con của chính người mua của cuộc này, ở đúng shop này
        const so = await this.prisma.shopOrder.findFirst({
          where: { id: dto.shopOrderId, shopId: conv.shopId, order: { buyerId: conv.buyerId } },
          include: { items: { orderBy: { id: 'asc' } }, order: { select: { createdAt: true } } },
        });
        if (!so) throw new AppError(404, 'NOT_FOUND', 'Không tìm thấy đơn hàng.');
        const first = so.items[0];
        const card: OrderCardView = {
          kind: 'ORDER',
          shopOrderId: so.id,
          orderId: so.orderId,
          code: so.code,
          status: so.status,
          total: so.total,
          itemCount: so.items.reduce((a, i) => a + i.quantity, 0),
          image: first?.image ?? null,
          firstItemName: first?.productName ?? '',
          placedAt: so.order.createdAt.toISOString(),
        };
        return { content: so.id, card, preview: `[Đơn hàng] ${so.code}` };
      }
    }
  }

  /** Thông báo CHAT_MESSAGE cho bên còn lại (chỉ khi bên đó chuyển từ "đã đọc hết" sang có tin chưa đọc) */
  private async notifyOther(
    tx: Tx,
    conv: ConversationRow,
    senderRole: ChatRole,
    preview: string,
  ): Promise<void> {
    const toBuyer = senderRole === 'SHOP';
    await this.notifications.notify(tx, {
      userId: toBuyer ? conv.buyerId : conv.shop.ownerId,
      type: 'CHAT_MESSAGE',
      title: toBuyer
        ? `Tin nhắn mới từ ${conv.shop.name ?? 'shop'}`
        : `Tin nhắn mới từ ${conv.buyerName}`,
      content: clip(preview, 200),
      link: chatLink(conv.id, toBuyer ? 'BUYER' : 'SHOP'),
    });
  }
}

function keyReused(): AppError {
  return new AppError(
    409,
    'IDEMPOTENCY_KEY_REUSED',
    'Mã gửi tin đã được dùng, bạn tải lại trang rồi thử lại.',
  );
}

export function conversationView(c: ConversationRow, role: ChatRole): ConversationView {
  return {
    id: c.id,
    role,
    shop: {
      id: c.shop.id,
      name: c.shop.name ?? '',
      logoUrl: c.shop.logoUrl,
      suspended: c.shop.status === 'SUSPENDED',
    },
    buyer: { id: c.buyerId, name: c.buyerName },
    lastMessageAt: c.lastMessageAt,
    lastMessagePreview: c.lastMessagePreview,
    unread: role === 'BUYER' ? c.buyerUnread : c.shopUnread,
    otherUnread: role === 'BUYER' ? c.shopUnread : c.buyerUnread,
    createdAt: c.createdAt,
  };
}

export function messageView(m: Message): MessageView {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderRole: m.senderRole,
    type: m.type,
    text: m.type === 'TEXT' ? m.content : null,
    imageKey: m.type === 'IMAGE' ? m.content : null,
    card: (m.card as unknown as ProductCardView | OrderCardView | null) ?? null,
    clientKey: m.clientKey,
    createdAt: m.createdAt,
  };
}
