import { useQuery } from '@tanstack/react-query';
import { ImageOff, Package, ReceiptText } from 'lucide-react';
import { Link } from 'react-router';
import { shopOrderStatusLabel } from '@/components/orders/order-parts';
import { API, apiBlob } from '@/lib/api';
import type { ChatMessage, ChatRole, OrderCard, ProductCard } from '@/lib/chat-types';
import { formatMoney } from '@/lib/format';
import type { ShopOrderStatus } from '@/lib/order-types';
import { cn } from '@/lib/utils';

const VN = 'Asia/Ho_Chi_Minh';
const hm = new Intl.DateTimeFormat('vi-VN', { timeZone: VN, hour: '2-digit', minute: '2-digit' });
const dm = new Intl.DateTimeFormat('vi-VN', { timeZone: VN, day: '2-digit', month: '2-digit' });
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: VN });

/** Giờ ngắn kiểu chat (giờ Việt Nam): hôm nay "14:05", ngày khác "12/10" */
export function chatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return dayKey.format(d) === dayKey.format(new Date()) ? hm.format(d) : dm.format(d);
}

export const messageTime = (iso: string) => hm.format(new Date(iso));

/** Dòng phân cách ngày trong khung chat: "Hôm nay", "12/10/2026" */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (dayKey.format(d) === dayKey.format(new Date())) return 'Hôm nay';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: VN,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export const sameDay = (a: string, b: string) =>
  dayKey.format(new Date(a)) === dayKey.format(new Date(b));

/** Ảnh chat trong bucket riêng tư: tải kèm vé đăng nhập, bấm để xem lớn */
export function ChatImage({ imageKey }: { imageKey: string }) {
  const q = useQuery({
    queryKey: ['chat-image', imageKey],
    queryFn: async () => URL.createObjectURL(await apiBlob(`${API.market}/${imageKey}`)),
    staleTime: Infinity,
    gcTime: 10 * 60_000,
    retry: false,
  });
  const box = 'flex size-48 items-center justify-center overflow-hidden rounded-2xl bg-ivory-200';
  if (q.isPending) return <div className={cn(box, 'animate-pulse')} />;
  if (q.isError) {
    return (
      <div className={box} title="Không tải được ảnh">
        <ImageOff className="size-6 text-ink/30" />
      </div>
    );
  }
  return (
    <button
      type="button"
      className={cn(box, 'transition hover:ring-2 hover:ring-champagne/60')}
      onClick={() => window.open(q.data, '_blank', 'noopener')}
      title="Xem ảnh lớn"
    >
      <img src={q.data} alt="Ảnh trong tin nhắn" className="size-full object-cover" />
    </button>
  );
}

function Thumb({ url, icon: Icon }: { url: string | null; icon: typeof Package }) {
  return (
    <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-ivory text-champagne-600">
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-5" />
      )}
    </span>
  );
}

export function ProductCardView({ card }: { card: ProductCard }) {
  const price =
    card.minPrice === card.maxPrice
      ? formatMoney(card.minPrice)
      : `${formatMoney(card.minPrice)} – ${formatMoney(card.maxPrice)}`;
  return (
    <Link
      to={`/san-pham/${card.productId}`}
      className="flex w-64 max-w-full gap-3 rounded-2xl border border-ivory-200 bg-card p-2.5 text-left transition hover:border-champagne"
    >
      <Thumb url={card.image} icon={Package} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium text-ink">{card.name}</span>
        <span className="mt-1 block text-sm font-semibold text-navy">{price}</span>
      </span>
    </Link>
  );
}

/** Thẻ đơn: người mua mở trang đơn của mình, shop mở trang đơn trong Kênh người bán */
export function OrderCardView({ card, role }: { card: OrderCard; role: ChatRole }) {
  const to =
    role === 'BUYER'
      ? `/tai-khoan/don-mua/${card.orderId}`
      : `/kenh-nguoi-ban/don-hang/${card.shopOrderId}`;
  return (
    <Link
      to={to}
      className="flex w-64 max-w-full gap-3 rounded-2xl border border-ivory-200 bg-card p-2.5 text-left transition hover:border-champagne"
    >
      <Thumb url={card.image} icon={ReceiptText} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-ink/50">Đơn {card.code}</span>
        <span className="line-clamp-1 text-sm font-medium text-ink">
          {card.firstItemName}
          {card.itemCount > 1 && ` và ${card.itemCount - 1} sản phẩm khác`}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-semibold text-navy">{formatMoney(card.total)}</span>
          <span className="text-champagne-600">
            {/* Đơn đã vào được chat là đơn đã đặt; PENDING hiện "Chờ duyệt đơn" */}
            {shopOrderStatusLabel(card.status as ShopOrderStatus, true)}
          </span>
        </span>
      </span>
    </Link>
  );
}

/** Nội dung một tin (bong bóng chữ, ảnh hoặc thẻ) */
export function MessageBody({
  m,
  mine,
  role,
}: {
  m: Pick<ChatMessage, 'type' | 'text' | 'imageKey' | 'card'>;
  mine: boolean;
  role: ChatRole;
}) {
  if (m.type === 'IMAGE' && m.imageKey) return <ChatImage imageKey={m.imageKey} />;
  if (m.card?.kind === 'PRODUCT') return <ProductCardView card={m.card} />;
  if (m.card?.kind === 'ORDER') return <OrderCardView card={m.card} role={role} />;
  return (
    <div
      className={cn(
        'max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap',
        mine
          ? 'rounded-br-md bg-navy text-white'
          : 'rounded-bl-md bg-card text-ink shadow-sm ring-1 ring-ivory-200',
      )}
    >
      {m.text}
    </div>
  );
}
