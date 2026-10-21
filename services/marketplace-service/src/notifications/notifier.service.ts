import { Injectable } from '@nestjs/common';
import type {
  DisputeDecidedPayload,
  RefundUpdatedPayload,
  WithdrawalUpdatedPayload,
} from '@san/shared';
import type {
  ApplicationType,
  CancelActor,
  Prisma,
  ReturnRequest,
  ShopOrderStatus,
} from '../../generated/prisma';
import { NotificationsService } from './notifications.service';

type Tx = Prisma.TransactionClient;

/** Tiền dạng 1.250.000đ */
export const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;

/** Giờ Việt Nam ngắn gọn, ví dụ 14:30 21/10 */
export function vnTime(d: Date): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('hour')}:${get('minute')} ${get('day')}/${get('month')}`;
}

/** Đường dẫn trên web (apps/web/src/router.tsx) */
export const links = {
  buyerOrder: (orderId: string) => `/tai-khoan/don-mua/${orderId}`,
  buyerReturn: (returnId: string) => `/tai-khoan/tra-hang/${returnId}`,
  sellerOrder: (shopOrderId: string) => `/kenh-nguoi-ban/don-hang/${shopOrderId}`,
  sellerReturn: (returnId: string) => `/kenh-nguoi-ban/tra-hang/${returnId}`,
  sellerHome: '/kenh-nguoi-ban',
  sellerProfile: '/kenh-nguoi-ban/ho-so-shop',
  sellerFinance: '/kenh-nguoi-ban/tai-chinh',
  myShop: '/tai-khoan/shop',
};

const byWhom: Record<CancelActor, string> = {
  BUYER: 'người mua',
  SELLER: 'shop',
  ADMIN: 'quản trị viên',
  SYSTEM: 'hệ thống',
};

/** Trạng thái đơn con có thông báo khi chuyển tới */
const NOTIFIED_STATUSES: ShopOrderStatus[] = [
  'TO_CONFIRM',
  'CONFIRMED',
  'CANCEL_REQUESTED',
  'CANCELLED',
  'SHIPPING',
  'DELIVERED',
  'COMPLETED',
  'RETURNING',
];

type NotifyType = Parameters<NotificationsService['notify']>[1]['type'];

/** Câu lý do gọn: bỏ dấu chấm cuối để ghép câu */
const reasonText = (s: string | null | undefined) => (s ?? '').trim().replace(/[.。]+$/, '');

/**
 * Soạn nội dung thông báo theo từng việc nghiệp vụ (MSG-02, bảng ở docs/phan-tich/13-quyet-dinh-p6.md mục 3)
 * rồi tạo thông báo trong cùng giao dịch của người gọi. Nội dung tiếng Việt cụ thể: mã đơn, tên shop, số tiền.
 */
@Injectable()
export class Notifier {
  constructor(private readonly notifications: NotificationsService) {}

  // ===== Đơn con (gọi từ OrderLifecycle.history: mọi lần đổi trạng thái đơn con) =====

  async orderTransition(
    tx: Tx,
    shopOrderId: string,
    from: ShopOrderStatus | null,
    to: ShopOrderStatus,
    actor: { type: CancelActor },
    note: string | null,
  ): Promise<void> {
    if (!NOTIFIED_STATUSES.includes(to)) return;
    const so = await tx.shopOrder.findUniqueOrThrow({
      where: { id: shopOrderId },
      include: {
        order: { select: { buyerId: true } },
        shop: { select: { ownerId: true, name: true } },
        returnRequest: { select: { status: true } },
      },
    });
    const shopName = so.shop.name ?? so.shopName;
    const buyer = (type: NotifyType, title: string, content: string) =>
      this.notifications.notify(tx, {
        userId: so.order.buyerId,
        type,
        title,
        content,
        link: links.buyerOrder(so.orderId),
      });
    const seller = (type: NotifyType, title: string, content: string) =>
      this.notifications.notify(tx, {
        userId: so.shop.ownerId,
        type,
        title,
        content,
        link: links.sellerOrder(so.id),
      });

    switch (to) {
      case 'TO_CONFIRM':
        await seller(
          'SHOP_ORDER_NEW',
          'Có đơn hàng mới',
          `Đơn ${so.code} (${money(so.subtotal)} tiền hàng) đang chờ shop xác nhận` +
            (so.confirmBefore ? `, hạn xác nhận ${vnTime(so.confirmBefore)}.` : '.'),
        );
        return;
      case 'CONFIRMED':
        if (from === 'CANCEL_REQUESTED') {
          const why = reasonText(note?.replace(/^Từ chối yêu cầu hủy:\s*/, ''));
          await buyer(
            'ORDER_CONFIRMED',
            'Shop từ chối yêu cầu hủy đơn',
            `${shopName} từ chối yêu cầu hủy đơn ${so.code}${why ? `: ${why}` : ''}. Đơn vẫn được giao như bình thường.`,
          );
          return;
        }
        await buyer(
          'ORDER_CONFIRMED',
          'Shop đã xác nhận đơn hàng',
          `${shopName} đã xác nhận đơn ${so.code} và đang chuẩn bị hàng để giao cho GHN.`,
        );
        return;
      case 'CANCEL_REQUESTED':
        await seller(
          'SHOP_ORDER_CANCEL_REQUESTED',
          'Người mua xin hủy đơn',
          `Người mua xin hủy đơn ${so.code}${note ? `: ${reasonText(note)}` : ''}. Hãy đồng ý hoặc từ chối trước khi GHN lấy hàng.`,
        );
        return;
      case 'CANCELLED': {
        const refund =
          so.refundStatus === 'PROCESSING' ? ` Sàn sẽ hoàn ${money(so.total)} cho bạn.` : '';
        // Người mua tự hủy thì không báo người mua; shop tự hủy thì không báo shop
        if (actor.type !== 'BUYER') {
          if (from === 'CANCEL_REQUESTED' && actor.type === 'SELLER') {
            await buyer(
              'ORDER_CANCELLED',
              'Shop đã đồng ý hủy đơn',
              `${shopName} đã đồng ý yêu cầu hủy đơn ${so.code} của bạn.${refund}`,
            );
          } else {
            const by = actor.type === 'SYSTEM' ? '' : ` bởi ${byWhom[actor.type]}`;
            await buyer(
              'ORDER_CANCELLED',
              'Đơn hàng đã bị hủy',
              `Đơn ${so.code} của ${shopName} đã bị hủy${by}. Lý do: ${reasonText(note) || 'không ghi'}.${refund}`,
            );
          }
        }
        // Đơn chưa thanh toán/chưa qua kiểm tra (PENDING) shop chưa thấy nên không báo shop
        if (actor.type !== 'SELLER' && from !== 'PENDING') {
          await seller(
            'SHOP_ORDER_CANCELLED',
            'Đơn hàng đã bị hủy',
            `Đơn ${so.code} đã bị hủy bởi ${byWhom[actor.type]}. Lý do: ${reasonText(note) || 'không ghi'}.`,
          );
        }
        return;
      }
      case 'SHIPPING':
        await buyer(
          'ORDER_SHIPPING',
          'Đơn hàng đang được giao',
          `GHN đã lấy hàng đơn ${so.code} của ${shopName} và đang giao tới bạn.`,
        );
        return;
      case 'DELIVERED':
        await buyer(
          'ORDER_DELIVERED',
          'Giao hàng thành công',
          `Đơn ${so.code} của ${shopName} đã được giao tới bạn. Nếu hàng có vấn đề, bạn có thể yêu cầu trả hàng trước khi đơn hoàn tất.`,
        );
        return;
      case 'COMPLETED':
        // Đơn hoàn tất vì yêu cầu trả hàng đã có kết quả: người mua đã nhận thông báo của yêu cầu đó
        if (so.returnRequest && so.returnRequest.status !== 'CANCELLED') return;
        await buyer(
          'ORDER_COMPLETED',
          'Đơn hàng đã hoàn tất',
          `Đơn ${so.code} của ${shopName} đã hoàn tất. Hãy đánh giá sản phẩm để giúp người mua khác nhé!`,
        );
        return;
      case 'RETURNING': {
        const refund =
          so.refundStatus === 'PROCESSING'
            ? ` Sàn sẽ hoàn ${money(so.total - so.shippingFee)} tiền hàng cho bạn.`
            : '';
        await buyer(
          'ORDER_FAILED',
          'Giao hàng không thành công',
          `Đơn ${so.code} của ${shopName} giao không thành công, hàng đang được hoàn về shop.${refund}`,
        );
        return;
      }
      default:
        return;
    }
  }

  /** Khoản hoàn tiền vừa xong (refund.updated sang SUCCEEDED / MANUAL_DONE) */
  async refundDone(tx: Tx, p: RefundUpdatedPayload): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: p.orderId },
      select: { buyerId: true, code: true },
    });
    if (!order) return;
    const how = p.status === 'MANUAL_DONE' ? 'đã chuyển khoản hoàn' : 'đã hoàn';
    if (p.returnId) {
      const ret = await tx.returnRequest.findUnique({
        where: { id: p.returnId },
        select: { code: true },
      });
      await this.notifications.notify(tx, {
        userId: order.buyerId,
        type: 'REFUND_DONE',
        title: 'Hoàn tiền thành công',
        content: `Sàn ${how} ${money(p.amount)} cho yêu cầu trả hàng ${ret?.code ?? ''} (đơn ${order.code}).`,
        link: links.buyerReturn(p.returnId),
      });
      return;
    }
    const so = p.shopOrderId
      ? await tx.shopOrder.findUnique({ where: { id: p.shopOrderId }, select: { code: true } })
      : null;
    await this.notifications.notify(tx, {
      userId: order.buyerId,
      type: 'REFUND_DONE',
      title: 'Hoàn tiền thành công',
      content: `Sàn ${how} ${money(p.amount)} cho đơn ${so?.code ?? order.code}.`,
      link: links.buyerOrder(p.orderId),
    });
  }

  // ===== Trả hàng (gọi từ ReturnLifecycle) =====

  /** Có yêu cầu trả hàng mới: báo chủ shop */
  async returnRequested(tx: Tx, ret: ReturnRequest): Promise<void> {
    const so = await this.returnContext(tx, ret);
    await this.notifications.notify(tx, {
      userId: so.shop.ownerId,
      type: 'SHOP_RETURN_REQUESTED',
      title: 'Có yêu cầu trả hàng mới',
      content:
        `Người mua yêu cầu trả hàng ${ret.code} cho đơn ${so.code}, xin hoàn ${money(ret.refundAmount)}.` +
        (ret.deadline ? ` Hãy trả lời trước ${vnTime(ret.deadline)}.` : ''),
      link: links.sellerReturn(ret.id),
    });
  }

  /** Yêu cầu được chấp nhận: gửi hàng về qua GHN, hoặc hoàn tiền ngay không cần gửi trả */
  async returnAccepted(
    tx: Tx,
    ret: ReturnRequest,
    mode: { refundNow: number } | { shipBefore: Date | null },
  ): Promise<void> {
    const so = await this.returnContext(tx, ret);
    const content =
      'refundNow' in mode
        ? `Yêu cầu trả hàng ${ret.code} đã được chấp nhận: sàn hoàn ${money(mode.refundNow)} cho bạn, không cần gửi trả hàng.`
        : `Yêu cầu trả hàng ${ret.code} đã được chấp nhận. GHN sẽ tới lấy hàng, bạn hãy gửi hàng` +
          (mode.shipBefore ? ` trước ${vnTime(mode.shipBefore)}.` : '.');
    await this.notifications.notify(tx, {
      userId: so.order.buyerId,
      type: 'RETURN_ACCEPTED',
      title: 'Yêu cầu trả hàng được chấp nhận',
      content,
      link: links.buyerReturn(ret.id),
    });
  }

  async returnRejected(tx: Tx, ret: ReturnRequest, reason: string, disputeBefore: Date) {
    const so = await this.returnContext(tx, ret);
    await this.notifications.notify(tx, {
      userId: so.order.buyerId,
      type: 'RETURN_REJECTED',
      title: 'Shop từ chối yêu cầu trả hàng',
      content: `${so.shop.name ?? so.shopName} từ chối yêu cầu ${ret.code}: ${reasonText(reason)}. Bạn có thể khiếu nại trước ${vnTime(disputeBefore)}.`,
      link: links.buyerReturn(ret.id),
    });
  }

  async returnRefunding(tx: Tx, ret: ReturnRequest, amount: number): Promise<void> {
    const so = await this.returnContext(tx, ret);
    await this.notifications.notify(tx, {
      userId: so.order.buyerId,
      type: 'RETURN_REFUNDING',
      title: 'Yêu cầu trả hàng được hoàn tiền',
      content: `Yêu cầu ${ret.code} được hoàn ${money(amount)}. Tiền đang được chuyển về cho bạn.`,
      link: links.buyerReturn(ret.id),
    });
  }

  /** Yêu cầu đóng/hủy không hoàn tiền mà không phải do chính người mua hủy */
  async returnClosed(tx: Tx, ret: ReturnRequest, cancelled: boolean, note: string) {
    const so = await this.returnContext(tx, ret);
    await this.notifications.notify(tx, {
      userId: so.order.buyerId,
      type: 'RETURN_CLOSED',
      title: cancelled ? 'Yêu cầu trả hàng đã hủy' : 'Yêu cầu trả hàng đã đóng',
      content: `Yêu cầu ${ret.code} ${cancelled ? 'đã hủy' : 'đã đóng'}, không hoàn tiền. ${reasonText(note)}.`,
      link: links.buyerReturn(ret.id),
    });
  }

  /** Admin phân xử tranh chấp: báo chủ shop kết quả */
  async disputeDecided(tx: Tx, p: DisputeDecidedPayload): Promise<void> {
    const ret = await tx.returnRequest.findUnique({ where: { id: p.returnId } });
    if (!ret) return;
    const so = await this.returnContext(tx, ret);
    const result =
      p.decision === 'ACCEPT_RETURN'
        ? 'chấp nhận trả hàng, người mua gửi hàng về shop'
        : p.decision === 'REFUND' && (p.refundAmount ?? 0) > 0
          ? `hoàn ${money(Math.min(p.refundAmount ?? 0, ret.refundAmount))} cho người mua`
          : 'không hoàn tiền cho người mua';
    await this.notifications.notify(tx, {
      userId: so.shop.ownerId,
      type: 'SHOP_RETURN_RESULT',
      title: 'Kết quả phân xử trả hàng',
      content: `Admin đã phân xử yêu cầu ${ret.code} (đơn ${so.code}): ${result}. ${reasonText(p.note)}.`,
      link: links.sellerReturn(ret.id),
    });
  }

  // ===== Shop =====

  /** Hồ sơ mở shop / đổi thông tin được duyệt hoặc bị từ chối */
  async shopApplication(
    tx: Tx,
    shopId: string,
    type: ApplicationType,
    status: 'APPROVED' | 'REJECTED',
    shopName: string,
    reason: string | null,
  ): Promise<void> {
    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { ownerId: true },
    });
    const register = type === 'REGISTER';
    const approved = status === 'APPROVED';
    await this.notifications.notify(tx, {
      userId: shop.ownerId,
      type: approved ? 'SHOP_APPROVED' : 'SHOP_REJECTED',
      title: register
        ? approved
          ? 'Shop đã được duyệt'
          : 'Hồ sơ mở shop chưa được duyệt'
        : approved
          ? 'Yêu cầu đổi thông tin shop đã được duyệt'
          : 'Yêu cầu đổi thông tin shop bị từ chối',
      content: register
        ? approved
          ? `Chúc mừng! Shop ${shopName} đã được duyệt. Bạn vào Kênh người bán để đăng sản phẩm nhé.`
          : `Hồ sơ mở shop ${shopName} bị từ chối: ${reasonText(reason)}. Bạn sửa lại hồ sơ rồi nộp lại nhé.`
        : approved
          ? `Thông tin mới của shop ${shopName} đã được áp dụng.`
          : `Yêu cầu đổi thông tin shop ${shopName} bị từ chối: ${reasonText(reason)}.`,
      link: register ? (approved ? links.sellerHome : links.myShop) : links.sellerProfile,
    });
  }

  async shopSuspension(
    tx: Tx,
    shopId: string,
    action: 'SUSPEND' | 'RESTORE',
    reason: string,
  ): Promise<void> {
    const shop = await tx.shop.findUniqueOrThrow({
      where: { id: shopId },
      select: { ownerId: true, name: true },
    });
    const suspended = action === 'SUSPEND';
    await this.notifications.notify(tx, {
      userId: shop.ownerId,
      type: suspended ? 'SHOP_SUSPENDED' : 'SHOP_RESTORED',
      title: suspended ? 'Shop bị tạm ngừng bán' : 'Shop đã được khôi phục',
      content: suspended
        ? `Shop ${shop.name ?? ''} bị đình chỉ: ${reasonText(reason)}. Sản phẩm tạm ẩn khỏi sàn, các đơn chưa giao cho GHN đã được hủy.`
        : `Shop ${shop.name ?? ''} đã hoạt động trở lại. Ghi chú của quản trị viên: ${reasonText(reason)}.`,
      link: links.sellerProfile,
    });
  }

  /** Yêu cầu rút tiền đổi trạng thái (withdrawal.updated) */
  async withdrawal(tx: Tx, p: WithdrawalUpdatedPayload): Promise<void> {
    const amount = money(p.amount);
    const text = {
      APPROVED: {
        type: 'WITHDRAWAL_APPROVED',
        title: 'Yêu cầu rút tiền đã được duyệt',
        content: `Yêu cầu rút ${amount} đã được duyệt, sàn sẽ chuyển khoản tới tài khoản của shop.`,
      },
      REJECTED: {
        type: 'WITHDRAWAL_REJECTED',
        title: 'Yêu cầu rút tiền bị từ chối',
        content: `Yêu cầu rút ${amount} bị từ chối${p.reason ? `: ${reasonText(p.reason)}` : ''}. Số tiền đã trở lại số dư khả dụng.`,
      },
      PAID: {
        type: 'WITHDRAWAL_PAID',
        title: 'Đã chuyển tiền rút',
        content: `Sàn đã chuyển khoản ${amount} tới tài khoản ngân hàng của shop.`,
      },
      FAILED: {
        type: 'WITHDRAWAL_FAILED',
        title: 'Chuyển tiền rút không thành công',
        content: `Chuyển khoản ${amount} không thành công${p.reason ? `: ${reasonText(p.reason)}` : ''}. Số tiền đã được mở khóa về số dư khả dụng, bạn có thể gửi yêu cầu mới.`,
      },
    } as const;
    await this.notifications.notify(tx, {
      userId: p.ownerId,
      ...text[p.status],
      link: links.sellerFinance,
    });
  }

  private returnContext(tx: Tx, ret: Pick<ReturnRequest, 'shopOrderId'>) {
    return tx.shopOrder.findUniqueOrThrow({
      where: { id: ret.shopOrderId },
      select: {
        code: true,
        shopName: true,
        order: { select: { buyerId: true } },
        shop: { select: { ownerId: true, name: true } },
      },
    });
  }
}
