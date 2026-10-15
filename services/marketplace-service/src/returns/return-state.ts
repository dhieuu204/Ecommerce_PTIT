import type { RefundUpdatedPayload } from '@san/shared';
import type { Prisma, ReturnRequest, ReturnStatus } from '../../generated/prisma';

type Tx = Prisma.TransactionClient;

/** Yêu cầu còn đang xử lý: đơn con chưa được hoàn tất, tiền seller còn bị giữ (STATE-03) */
export const OPEN_RETURN_STATUSES: ReturnStatus[] = [
  'REQUESTED',
  'REJECTED',
  'DISPUTED',
  'SHIPPING_BACK',
  'RECEIVED',
];

/** Một bước đã qua của yêu cầu trả hàng (cột history) */
export interface ReturnHistoryEntry {
  at: string;
  actorType: 'BUYER' | 'SELLER' | 'ADMIN' | 'SYSTEM';
  actorName: string | null;
  /** Trạng thái sau bước này */
  status: ReturnStatus;
  note: string | null;
}

/** Danh sách bước đã qua thêm một bước (người gọi đã khóa theo đơn nên không mất bước của người khác) */
export function withHistory(
  ret: Pick<ReturnRequest, 'history'>,
  entry: Omit<ReturnHistoryEntry, 'at'> & { at?: Date },
): Prisma.InputJsonValue {
  const list = Array.isArray(ret.history) ? (ret.history as unknown as ReturnHistoryEntry[]) : [];
  const { at, ...rest } = entry;
  return [
    ...list,
    { ...rest, at: (at ?? new Date()).toISOString() },
  ] as unknown as Prisma.InputJsonValue;
}

/**
 * Khoản hoàn của yêu cầu trả hàng đổi trạng thái (refund.updated có returnId, RET-04): lưu để người mua,
 * shop thấy; hoàn xong thì yêu cầu thành "Đã hoàn tiền". Chỉ áp tin mới hơn.
 */
export async function applyReturnRefund(tx: Tx, p: RefundUpdatedPayload): Promise<void> {
  const ret = await tx.returnRequest.findUnique({ where: { id: p.returnId! } });
  // Khoản hoàn chỉ tạo sau return.resolved nên luôn có yêu cầu; không thấy thì để thử lại
  if (!ret) throw new Error(`Chưa có yêu cầu trả hàng ${p.returnId}`);
  const updatedAt = new Date(p.updatedAt);
  if (ret.refundUpdatedAt && ret.refundUpdatedAt > updatedAt) return;
  const done = p.status === 'SUCCEEDED' || p.status === 'MANUAL_DONE';
  const toRefunded = done && ret.status === 'REFUNDING';
  await tx.returnRequest.update({
    where: { id: ret.id },
    data: {
      refundStatus: p.status,
      refundUpdatedAt: updatedAt,
      ...(toRefunded
        ? {
            status: 'REFUNDED',
            history: withHistory(ret, {
              actorType: 'SYSTEM',
              actorName: 'Hệ thống',
              status: 'REFUNDED',
              note:
                p.status === 'MANUAL_DONE'
                  ? `Đã chuyển khoản hoàn ${p.amount.toLocaleString('vi-VN')}đ cho người mua`
                  : `Đã hoàn ${p.amount.toLocaleString('vi-VN')}đ cho người mua`,
            }),
          }
        : {}),
    },
  });
}
