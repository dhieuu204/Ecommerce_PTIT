import { useQuery } from '@tanstack/react-query';
import { Loader2, Package, ReceiptText, Search } from 'lucide-react';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CHAT_KEY } from '@/hooks/use-chat';
import { useDebounced } from '@/hooks/use-debounced';
import { API, api } from '@/lib/api';
import type { ProductCardData } from '@/lib/catalog-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { Order } from '@/lib/order-types';
import type { Page } from '@/lib/types';
import { shopOrderStatusLabel } from '@/components/orders/order-parts';

function Row({
  image,
  icon: Icon,
  title,
  sub,
  onClick,
}: {
  image: string | null;
  icon: typeof Package;
  title: string;
  sub: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-ivory-200/70"
    >
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-ivory-200 bg-ivory text-champagne-600">
        {image ? (
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          <Icon className="size-5" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-1 text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 block text-xs text-ink/60">{sub}</span>
      </span>
    </button>
  );
}

function ListState({
  pending,
  error,
  empty,
}: {
  pending: boolean;
  error?: string;
  empty: string | null;
}) {
  if (pending) {
    return (
      <div className="flex justify-center py-8 text-ink/40">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }
  if (error) return <p className="py-8 text-center text-sm text-ink/60">{error}</p>;
  if (empty) return <p className="py-8 text-center text-sm text-ink/60">{empty}</p>;
  return null;
}

/** Chọn một sản phẩm đang bán của shop để gửi thẻ sản phẩm */
export function ProductPicker({
  shopId,
  open,
  onOpenChange,
  onPick,
}: {
  shopId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (productId: string, name: string) => void;
}) {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim(), 300);
  const list = useQuery({
    queryKey: ['chat-pick-products', shopId, term],
    queryFn: () =>
      api<Page<ProductCardData>>(`${API.market}/products`, {
        query: { shopId, q: term || undefined, pageSize: 20 },
      }),
    enabled: open,
  });
  const items = list.data?.items ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Gửi sản phẩm</DialogTitle>
          <DialogDescription>
            Chọn sản phẩm đang bán của shop để gửi kèm tin nhắn.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink/40" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm theo tên sản phẩm"
            className="pl-9"
            maxLength={100}
          />
        </div>
        <div className="-mx-2 min-h-40 overflow-y-auto">
          <ListState
            pending={list.isPending}
            error={list.isError ? list.error.message : undefined}
            empty={items.length === 0 ? 'Không có sản phẩm phù hợp.' : null}
          />
          {items.map((p) => (
            <Row
              key={p.id}
              image={p.image}
              icon={Package}
              title={p.name}
              sub={
                p.minPrice === p.maxPrice
                  ? formatMoney(p.minPrice)
                  : `${formatMoney(p.minPrice)} – ${formatMoney(p.maxPrice)}`
              }
              onClick={() => onPick(p.id, p.name)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Người mua chọn một đơn của mình ở shop này để gửi thẻ đơn hàng (lấy trong 50 đơn gần nhất) */
export function OrderPicker({
  shopId,
  open,
  onOpenChange,
  onPick,
}: {
  shopId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (shopOrderId: string, code: string) => void;
}) {
  const list = useQuery({
    queryKey: [...CHAT_KEY, 'pick-orders'],
    queryFn: () => api<Page<Order>>(`${API.market}/orders`, { query: { pageSize: 50 } }),
    enabled: open,
  });
  const rows = (list.data?.items ?? []).flatMap((o) =>
    o.shopOrders.filter((so) => so.shop.id === shopId).map((so) => ({ so, order: o })),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Gửi đơn hàng</DialogTitle>
          <DialogDescription>Chọn đơn bạn đã đặt ở shop này để shop xem nhanh.</DialogDescription>
        </DialogHeader>
        <div className="-mx-2 min-h-40 overflow-y-auto">
          <ListState
            pending={list.isPending}
            error={list.isError ? list.error.message : undefined}
            empty={rows.length === 0 ? 'Bạn chưa có đơn nào ở shop này.' : null}
          />
          {rows.map(({ so, order }) => (
            <Row
              key={so.id}
              image={so.items[0]?.image ?? null}
              icon={ReceiptText}
              title={`Đơn ${so.code} · ${so.items[0]?.productName ?? ''}`}
              sub={
                <>
                  {formatMoney(so.total)} ·{' '}
                  {shopOrderStatusLabel(so.status, order.paymentStatus !== 'UNPAID')} ·{' '}
                  {formatDateTime(order.createdAt)}
                </>
              }
              onClick={() => onPick(so.id, so.code)}
            />
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
