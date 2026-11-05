import {
  IconAlertTriangle,
  IconChevronRight,
  IconHome,
  IconLoader2,
  IconPhotoOff,
  IconRosetteDiscountCheckFilled,
  IconShoppingBag,
  IconTicket,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useProductSearch } from '@/components/catalog/browse-query';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { shortValue } from '@/components/catalog/voucher-ticket';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { ProductRow, SectionTitle } from '@/components/home/home-sections';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useCart } from '@/hooks/use-cart';
import { API, api } from '@/lib/api';
import type { Cart, CartItem, Voucher } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCartBulkActions, useCartItemActions } from './cart-actions';
import { VariantSwitcher } from './variant-switcher';

/** Bóng nhẹ chung của các thẻ trắng (giống trang chủ, trang sản phẩm) */
const CARD = 'rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)]';

/** Cột của dòng giỏ trên màn rộng: sản phẩm | đơn giá | số lượng | thành tiền | xóa */
const COLS = 'lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_8rem_8rem_2.5rem] lg:items-center lg:gap-3';

/** Chọn được = chưa "không còn bán" */
const selectable = (it: CartItem) => it.state !== 'UNAVAILABLE';

/** Số tiền gọn: 300000 → "300k", 15000000 → "15tr" */
function compactMoney(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return formatMoney(n);
}

/**
 * Giỏ hàng (CRT-01), bố cục theo giỏ hàng các trang bán lẻ lớn (CellphoneS, Thế Giới Di Động, Shopee): cột
 * trái các thẻ shop (chọn, đổi số lượng/phân loại, xóa, mã giảm của shop), cột phải khối tóm tắt đơn bám theo
 * khi cuộn với nút Mua hàng; điện thoại có thanh tổng cố định ở đáy. Dưới cùng gợi ý sản phẩm bán chạy.
 */
export function CartPage() {
  const cart = useCart();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 lg:pb-12">
      <nav
        aria-label="Đường dẫn"
        className="flex items-center gap-1.5 py-3.5 text-[13px] text-ink/55"
      >
        <Link to="/" className="flex items-center gap-1 transition hover:text-navy">
          <IconHome className="size-4 [stroke-width:1.75]" />
          Trang chủ
        </Link>
        <IconChevronRight className="size-3.5 text-ink/30" />
        <span className="font-medium text-charcoal">Giỏ hàng</span>
      </nav>

      {cart.isPending ? (
        <CartSkeleton />
      ) : cart.isError ? (
        <LoadError className={CARD} message={cart.error.message} onRetry={() => cart.refetch()} />
      ) : cart.data.shops.length === 0 ? (
        <EmptyCart />
      ) : (
        <CartView cart={cart.data} />
      )}

      <Suggestions />
    </div>
  );
}

function CartView({ cart }: { cart: Cart }) {
  const items = cart.shops.flatMap((g) => g.items);
  const choosable = items.filter(selectable);
  const allSelected = choosable.length > 0 && choosable.every((it) => it.selected);
  const selectedIds = items.filter((it) => it.selected).map((it) => it.id);
  const unavailableIds = items.filter((it) => it.state === 'UNAVAILABLE').map((it) => it.id);
  const okSelected = items.filter((it) => it.selected && it.state === 'OK');
  const savings = okSelected
    .filter((it) => it.originalPrice && it.originalPrice > it.price)
    .reduce((sum, it) => sum + (it.originalPrice! - it.price) * it.quantity, 0);
  const shopCount = new Set(
    cart.shops
      .filter((g) => g.items.some((it) => it.selected && it.state === 'OK'))
      .map((g) => g.shop.id),
  ).size;

  // Mua hàng: các dòng đang chọn; dòng chọn mà hết hàng/vượt tồn thì phải sửa trước
  const buyIds = okSelected.map((it) => it.id);
  const blocked = items.filter(
    (it) => it.selected && (it.state === 'OUT_OF_STOCK' || it.state === 'NOT_ENOUGH_STOCK'),
  ).length;
  const navigate = useNavigate();
  const checkout = () => navigate(`/dat-hang?items=${buyIds.join(',')}`);
  const canBuy = buyIds.length > 0 && blocked === 0;

  const { select, removeMany } = useCartBulkActions();
  const [confirm, setConfirm] = useState<null | { ids: string[]; title: string; text: string }>(
    null,
  );

  const toggleAll = () =>
    select.mutate({ itemIds: choosable.map((it) => it.id), selected: !allSelected });
  const askRemoveSelected = () =>
    setConfirm({
      ids: selectedIds,
      title: `Xóa ${selectedIds.length} sản phẩm đã chọn?`,
      text:
        selectedIds.length === 1
          ? 'Sản phẩm này sẽ được bỏ khỏi giỏ hàng.'
          : 'Các sản phẩm này sẽ được bỏ khỏi giỏ hàng.',
    });
  const askRemoveUnavailable = () =>
    setConfirm({
      ids: unavailableIds,
      title: 'Xóa sản phẩm không còn bán?',
      text: `${unavailableIds.length} sản phẩm đã ngừng bán sẽ được bỏ khỏi giỏ hàng.`,
    });
  const doRemove = () => {
    if (!confirm) return;
    const n = confirm.ids.length;
    removeMany.mutate(confirm.ids, {
      onSuccess: () => toast.success(`Đã xóa ${n} sản phẩm khỏi giỏ hàng.`),
    });
    setConfirm(null);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">
          Giỏ hàng <span className="font-medium text-ink/40">({items.length})</span>
        </h1>
        <Link
          to="/"
          className="group flex items-center gap-1 text-sm font-semibold text-navy transition hover:text-navy-900"
        >
          Tiếp tục mua sắm
          <IconChevronRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
        </Link>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        {/* Cột trái: danh sách */}
        <div className="min-w-0 space-y-4">
          {unavailableIds.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl bg-champagne-50 px-4 py-3 text-sm text-charcoal ring-1 ring-champagne/40 sm:flex-row sm:items-center">
              <IconAlertTriangle className="hidden size-5 shrink-0 text-champagne-600 sm:block" />
              <span className="flex-1">
                Có <b>{unavailableIds.length}</b> sản phẩm không còn bán (shop đã ẩn hoặc ngừng
                bán).
              </span>
              <button
                type="button"
                onClick={askRemoveUnavailable}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-card px-3 text-xs font-semibold text-charcoal ring-1 ring-ink/10 transition hover:text-navy"
              >
                <IconTrash className="size-4 [stroke-width:1.75]" />
                Xóa sản phẩm không còn bán
              </button>
            </div>
          )}

          {/* Chọn tất cả + tên cột */}
          <div
            className={cn(
              CARD,
              'flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-ink/55 lg:px-5',
              COLS,
            )}
          >
            <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-charcoal">
              <Checkbox
                checked={allSelected}
                disabled={choosable.length === 0}
                onCheckedChange={toggleAll}
                aria-label="Chọn tất cả"
                className="size-[18px]"
              />
              Chọn tất cả ({choosable.length})
            </label>
            <span className="hidden text-center lg:block">Đơn giá</span>
            <span className="hidden text-center lg:block">Số lượng</span>
            <span className="hidden text-center lg:block">Thành tiền</span>
            <button
              type="button"
              aria-label="Xóa mục đã chọn"
              title="Xóa mục đã chọn"
              disabled={selectedIds.length === 0 || removeMany.isPending}
              onClick={askRemoveSelected}
              className="flex items-center justify-center gap-1.5 text-ink/55 transition hover:text-navy disabled:pointer-events-none disabled:opacity-40"
            >
              <IconTrash className="size-[1.125rem] [stroke-width:1.75]" />
              <span className="lg:hidden">Xóa đã chọn</span>
            </button>
          </div>

          {cart.shops.map((group) => (
            <ShopGroup
              key={group.shop.id}
              group={group}
              onSelect={(itemIds, selected) => select.mutate({ itemIds, selected })}
            />
          ))}
        </div>

        {/* Cột phải: tóm tắt đơn */}
        <aside className={cn(CARD, 'hidden p-5 lg:sticky lg:top-20 lg:block')}>
          <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-charcoal">
            <span aria-hidden className="h-[3px] w-5 shrink-0 rounded-full bg-navy" />
            Tóm tắt đơn hàng
          </h2>
          <dl className="mt-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Tạm tính ({cart.selectedCount} sản phẩm)</dt>
              <dd className="font-medium text-charcoal">
                {formatMoney(cart.selectedTotal + savings)}
              </dd>
            </div>
            {savings > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-ink/60">Giảm giá trực tiếp</dt>
                <dd className="font-medium text-navy">-{formatMoney(savings)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="text-ink/60">Phí vận chuyển</dt>
              <dd className="text-ink/50">Tính ở bước đặt hàng</dd>
            </div>
          </dl>
          <div className="mt-4 border-t border-dashed border-ink/15 pt-4">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm font-medium text-charcoal">Tổng tiền</span>
              <span className="text-2xl leading-none font-bold tracking-tight text-navy">
                {formatMoney(cart.selectedTotal)}
              </span>
            </div>
            {savings > 0 && (
              <p className="mt-1.5 text-right text-xs text-ink/55">
                Tiết kiệm <b className="font-semibold text-navy">{formatMoney(savings)}</b>
              </p>
            )}
          </div>

          <p className="mt-4 flex items-start gap-2 rounded-xl bg-page px-3 py-2.5 text-xs leading-relaxed text-ink/60">
            <IconTicket className="mt-px size-4 shrink-0 text-navy [stroke-width:1.75]" />
            Voucher shop và voucher sàn được chọn tự động ở bước đặt hàng, bạn có thể đổi mã khác.
          </p>

          {blocked > 0 && (
            <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-champagne-600">
              <IconAlertTriangle className="size-4 shrink-0 [stroke-width:1.75]" />
              {blocked} sản phẩm đã chọn cần sửa (hết hàng hoặc vượt tồn)
            </p>
          )}

          <button
            type="button"
            disabled={!canBuy}
            onClick={checkout}
            className="mt-4 h-12 w-full rounded-lg bg-gradient-to-r from-header-from to-header-to text-[15px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(238,77,45,0.7)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >
            Mua hàng ({buyIds.length})
          </button>
          {shopCount > 1 && (
            <p className="mt-2 text-center text-xs text-ink/50">
              Đơn của {shopCount} shop, thanh toán một lần
            </p>
          )}
        </aside>
      </div>

      {/* Thanh tổng cố định đáy màn hình (điện thoại, máy tính bảng) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,26,61,0.25)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-charcoal">
            <Checkbox
              checked={allSelected}
              disabled={choosable.length === 0}
              onCheckedChange={toggleAll}
              aria-label="Chọn tất cả"
              className="size-[18px]"
            />
            Tất cả
          </label>
          <div className="ml-auto min-w-0 text-right">
            <div className="text-[11px] text-ink/55">Tổng ({cart.selectedCount})</div>
            <div className="truncate text-lg leading-6 font-bold text-navy">
              {formatMoney(cart.selectedTotal)}
            </div>
          </div>
          <button
            type="button"
            disabled={!canBuy}
            onClick={checkout}
            className="h-12 shrink-0 rounded-lg bg-gradient-to-r from-header-from to-header-to px-5 text-[15px] font-bold text-white disabled:opacity-50"
          >
            Mua hàng ({buyIds.length})
          </button>
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-charcoal">{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Giữ lại
            </Button>
            <Button variant="destructive" onClick={doRemove}>
              <IconTrash className="size-4" />
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Mã giảm của shop dưới đầu thẻ shop (chỉ để biết; áp mã ở bước đặt hàng) */
function ShopVoucherHint({ shopId }: { shopId: string }) {
  const q = useQuery({
    queryKey: ['shop-vouchers', shopId],
    queryFn: () => api<Voucher[]>(`${API.market}/shops/${shopId}/vouchers`),
    staleTime: 60_000,
  });
  const list = q.data ?? [];
  if (list.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink/[0.06] px-4 py-2.5 text-xs lg:px-5">
      <IconTicket className="size-4 text-navy [stroke-width:1.75]" />
      {list.slice(0, 3).map((v) => (
        <span
          key={v.id}
          className="rounded-md border border-dashed border-navy/40 bg-champagne-50 px-2 py-0.5 font-semibold text-navy"
        >
          Giảm {shortValue(v)}
          {v.minOrder > 0 && (
            <span className="font-normal text-navy/75"> đơn từ {compactMoney(v.minOrder)}</span>
          )}
        </span>
      ))}
      <span className="text-ink/45">Áp dụng ở bước đặt hàng</span>
    </div>
  );
}

function ShopGroup({
  group,
  onSelect,
}: {
  group: Cart['shops'][number];
  onSelect: (itemIds: string[], selected: boolean) => void;
}) {
  const choosable = group.items.filter(selectable);
  const all = choosable.length > 0 && choosable.every((it) => it.selected);
  return (
    <section className={cn(CARD, 'overflow-hidden')}>
      <header className="flex items-center gap-3 border-b border-ink/[0.06] px-4 py-3 lg:px-5">
        <Checkbox
          checked={all}
          disabled={choosable.length === 0}
          onCheckedChange={() =>
            onSelect(
              choosable.map((it) => it.id),
              !all,
            )
          }
          aria-label={`Chọn tất cả sản phẩm của ${group.shop.name}`}
          className="size-[18px]"
        />
        <Link
          to={`/shop/${group.shop.id}`}
          className="group flex min-w-0 items-center gap-2.5 text-sm font-semibold text-charcoal"
        >
          <ShopLogo url={group.shop.logoUrl} className="size-7 rounded-lg ring-1 ring-ink/[0.08]" />
          <span className="truncate transition group-hover:text-navy">{group.shop.name}</span>
          <IconRosetteDiscountCheckFilled className="size-4 shrink-0 text-navy" />
          <IconChevronRight className="size-4 shrink-0 text-ink/35 [stroke-width:2]" />
        </Link>
      </header>
      <ShopVoucherHint shopId={group.shop.id} />
      <div className="divide-y divide-ink/[0.06]">
        {group.items.map((item) => (
          <CartRow key={item.id} item={item} onToggle={() => onSelect([item.id], !item.selected)} />
        ))}
      </div>
    </section>
  );
}

function CartRow({ item, onToggle }: { item: CartItem; onToggle: () => void }) {
  const { setQuantity, setVariant, remove } = useCartItemActions(item.id);
  const unavailable = item.state === 'UNAVAILABLE';
  const outOfStock = item.state === 'OUT_OF_STOCK';
  const greyed = unavailable || outOfStock;
  const hasDiscount = !!item.originalPrice && item.originalPrice > item.price;
  const productLink = `/san-pham/${item.productId}`;

  const onRemove = () =>
    remove.mutate(undefined, {
      onSuccess: () => toast.success('Đã xóa sản phẩm khỏi giỏ hàng.'),
    });

  const stepper = !unavailable && (
    <QuantityStepper
      size="sm"
      value={item.quantity}
      max={Math.max(item.available, 1)}
      disabled={outOfStock}
      onChange={(q) => setQuantity.mutate(q)}
    />
  );
  const removeButton = (className: string) => (
    <button
      type="button"
      aria-label="Xóa"
      title="Xóa khỏi giỏ"
      onClick={onRemove}
      disabled={remove.isPending}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg text-ink/40 transition hover:bg-champagne-50 hover:text-navy',
        className,
      )}
    >
      {remove.isPending ? (
        <IconLoader2 className="size-4 animate-spin" />
      ) : (
        <IconTrash className="size-[1.125rem] [stroke-width:1.75]" />
      )}
    </button>
  );

  return (
    <div className={cn('relative px-4 py-4 lg:px-5', COLS, greyed && 'bg-page/60')}>
      {/* Sản phẩm */}
      <div className="flex min-w-0 gap-3 lg:items-center">
        <Checkbox
          checked={item.selected && !unavailable}
          disabled={unavailable}
          onCheckedChange={onToggle}
          aria-label={`Chọn ${item.productName}`}
          className="mt-8 size-[18px] lg:mt-0"
        />
        <Link
          to={productLink}
          className={cn(
            'relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-ink/[0.08] lg:size-[5.5rem]',
            greyed && 'opacity-50 grayscale',
          )}
        >
          {item.image ? (
            <img src={item.image} alt={item.productName} className="size-full object-contain" />
          ) : (
            <IconPhotoOff className="size-6 text-ink/25" />
          )}
          {hasDiscount && !greyed && (
            <span className="absolute top-0 left-0 rounded-br-md bg-navy px-1 py-px text-[10px] font-bold text-white">
              -{Math.round(((item.originalPrice! - item.price) / item.originalPrice!) * 100)}%
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link
              to={productLink}
              className={cn(
                'line-clamp-2 flex-1 text-sm leading-5 font-medium text-charcoal transition hover:text-navy',
                greyed && 'text-ink/50',
              )}
            >
              {item.productName}
            </Link>
            {removeButton('-mt-1.5 -mr-2 lg:hidden')}
          </div>
          <VariantSwitcher
            item={item}
            pending={setVariant.isPending}
            onChange={(variantId) =>
              setVariant.mutate(variantId, {
                onSuccess: () => toast.success('Đã đổi phân loại.'),
              })
            }
          />
          <StateNote item={item} onReduce={() => setQuantity.mutate(item.available)} />

          {/* Giá, số lượng trên màn hẹp */}
          <div className="mt-2.5 flex items-end justify-between gap-2 lg:hidden">
            <div>
              <span className={cn('text-base font-bold text-navy', greyed && 'text-ink/45')}>
                {formatMoney(item.price)}
              </span>
              {hasDiscount && (
                <span className="ml-1.5 text-xs text-ink/40 line-through">
                  {formatMoney(item.originalPrice!)}
                </span>
              )}
            </div>
            {stepper || <span className="text-sm text-ink/45">Số lượng: {item.quantity}</span>}
          </div>
        </div>
      </div>

      {/* Các cột trên màn rộng */}
      <div className="hidden text-center lg:block">
        <div className={cn('text-sm font-semibold text-charcoal', greyed && 'text-ink/45')}>
          {formatMoney(item.price)}
        </div>
        {hasDiscount && (
          <div className="text-xs text-ink/40 line-through">{formatMoney(item.originalPrice!)}</div>
        )}
      </div>
      <div className="hidden justify-center lg:flex">
        {stepper || <span className="text-sm text-ink/40">{item.quantity}</span>}
      </div>
      <div
        className={cn(
          'hidden text-center text-[15px] font-bold text-navy lg:block',
          (greyed || item.state === 'NOT_ENOUGH_STOCK') && 'text-ink/40',
        )}
      >
        {formatMoney(item.price * item.quantity)}
      </div>
      <div className="hidden justify-center lg:flex">{removeButton('')}</div>
    </div>
  );
}

/** Ghi chú tình trạng dòng: thiếu hàng (kèm nút giảm số lượng), hết hàng, không còn bán */
function StateNote({ item, onReduce }: { item: CartItem; onReduce: () => void }) {
  if (item.state === 'NOT_ENOUGH_STOCK') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-champagne-50 px-2 py-1 font-medium text-champagne-600">
          <IconAlertTriangle className="size-3.5 [stroke-width:2]" />
          Chỉ còn {item.available} sản phẩm
        </span>
        <button
          type="button"
          onClick={onReduce}
          className="rounded-md border border-navy/30 bg-card px-2 py-[3px] font-semibold text-navy transition hover:bg-navy hover:text-white"
        >
          Giảm còn {item.available}
        </button>
      </div>
    );
  }
  if (item.state === 'OUT_OF_STOCK' || item.state === 'UNAVAILABLE') {
    return (
      <div className="mt-2">
        <span className="inline-flex rounded-md bg-ink/[0.06] px-2 py-1 text-xs font-medium text-ink/60">
          {item.state === 'OUT_OF_STOCK' ? 'Tạm hết hàng' : 'Sản phẩm không còn bán'}
        </span>
      </div>
    );
  }
  return null;
}

/** Gợi ý dưới giỏ: hàng bán chạy (như "Có thể bạn cũng thích" của các sàn) */
function Suggestions() {
  const q = useProductSearch({ sort: 'best_selling', pageSize: 10 });
  if (q.isError || (q.data && q.data.items.length === 0)) return null;
  return (
    <section className="mt-10">
      <SectionTitle title="Có thể bạn cũng thích" more="/tim-kiem?sort=best_selling" />
      <ProductRow items={q.data?.items ?? []} loading={q.isPending} rows={2} />
    </section>
  );
}

function EmptyCart() {
  return (
    <div className={cn(CARD, 'flex flex-col items-center px-6 py-16 text-center md:py-20')}>
      <span className="flex size-24 items-center justify-center rounded-full bg-champagne-50 text-navy">
        <IconShoppingBag className="size-11 [stroke-width:1.25]" />
      </span>
      <h1 className="mt-6 text-xl font-bold text-charcoal">Giỏ hàng của bạn đang trống</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/60">
        Thêm điện thoại, laptop hay phụ kiện bạn thích vào giỏ để đặt hàng.
      </p>
      <Link
        to="/"
        className="mt-7 inline-flex h-12 items-center gap-2 rounded-lg bg-gradient-to-r from-header-from to-header-to px-8 text-[15px] font-bold text-white shadow-[0_12px_24px_-12px_rgba(238,77,45,0.7)] transition hover:brightness-105"
      >
        <IconShoppingBag className="size-5 [stroke-width:1.75]" />
        Tiếp tục mua sắm
      </Link>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div>
        <Skeleton className="mb-4 h-8 w-44 rounded-lg" />
        <Skeleton className="mb-4 h-12 w-full rounded-2xl" />
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className={cn(CARD, 'mb-4 p-4')}>
            <Skeleton className="h-6 w-40" />
            {Array.from({ length: 2 }, (_, j) => (
              <div key={j} className="mt-4 flex gap-3">
                <Skeleton className="size-20 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-6 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
      <Skeleton className="hidden h-80 rounded-2xl lg:block" />
    </div>
  );
}
