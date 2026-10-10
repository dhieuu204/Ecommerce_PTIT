import {
  AlertTriangle,
  ChevronRight,
  ImageOff,
  Info,
  Loader2,
  ShoppingBag,
  ShoppingCart,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
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
import type { Cart, CartItem } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useCartBulkActions, useCartItemActions } from './cart-actions';
import { VariantSwitcher } from './variant-switcher';

/** Cột của bảng giỏ trên màn rộng: sản phẩm | đơn giá | số lượng | thành tiền | xóa */
const COLS = 'lg:grid lg:grid-cols-[minmax(0,1fr)_10rem_9rem_9rem_3.5rem] lg:items-center lg:gap-4';

/** Chọn được = chưa "không còn bán" */
const selectable = (it: CartItem) => it.state !== 'UNAVAILABLE';

/** Giỏ hàng (CRT-01): nhóm theo shop, chọn dòng, đổi số lượng/phân loại, xóa; Mua hàng sang trang Thanh toán (P3) */
export function CartPage() {
  const cart = useCart();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-5 md:pt-8">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-ink/55">
        <Link to="/" className="hover:text-navy">
          Trang chủ
        </Link>
        <ChevronRight className="size-3.5 text-ink/30" />
        <span className="text-ink">Giỏ hàng</span>
      </nav>

      {cart.isPending ? (
        <CartSkeleton />
      ) : cart.isError ? (
        <LoadError
          className="rounded-3xl border border-ivory-200 bg-card"
          message={cart.error.message}
          onRetry={() => cart.refetch()}
        />
      ) : cart.data.shops.length === 0 ? (
        <EmptyCart />
      ) : (
        <CartView cart={cart.data} />
      )}
    </div>
  );
}

function CartView({ cart }: { cart: Cart }) {
  const items = cart.shops.flatMap((g) => g.items);
  const choosable = items.filter(selectable);
  const allSelected = choosable.length > 0 && choosable.every((it) => it.selected);
  const selectedIds = items.filter((it) => it.selected).map((it) => it.id);
  const unavailableIds = items.filter((it) => it.state === 'UNAVAILABLE').map((it) => it.id);
  const savings = items
    .filter(
      (it) => it.selected && it.state === 'OK' && it.originalPrice && it.originalPrice > it.price,
    )
    .reduce((sum, it) => sum + (it.originalPrice! - it.price) * it.quantity, 0);

  // Mua hàng: các dòng đang chọn; dòng chọn mà hết hàng/vượt tồn thì phải sửa trước
  const buyIds = items.filter((it) => it.selected && it.state === 'OK').map((it) => it.id);
  const blocked = items.filter(
    (it) => it.selected && (it.state === 'OUT_OF_STOCK' || it.state === 'NOT_ENOUGH_STOCK'),
  ).length;
  const navigate = useNavigate();

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
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold text-navy md:text-[1.75rem]">
          <span className="flex size-10 items-center justify-center rounded-2xl bg-navy text-champagne">
            <ShoppingCart className="size-5" />
          </span>
          Giỏ hàng <span className="font-semibold text-ink/40">({items.length})</span>
        </h1>
        <Link
          to="/"
          className="flex items-center gap-1 text-sm font-medium text-champagne-600 hover:text-navy"
        >
          Tiếp tục mua sắm <ChevronRight className="size-4" />
        </Link>
      </div>

      {unavailableIds.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:flex-row sm:items-center">
          <AlertTriangle className="hidden size-5 shrink-0 sm:block" />
          <span className="flex-1">
            Có <b>{unavailableIds.length}</b> sản phẩm không còn bán (shop đã ẩn hoặc ngừng bán).
          </span>
          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 bg-card text-amber-800 hover:bg-amber-100"
            onClick={askRemoveUnavailable}
          >
            <Trash2 className="size-4" />
            Xóa sản phẩm không còn bán
          </Button>
        </div>
      )}

      {/* Dòng tiêu đề: chọn tất cả + tên cột (màn rộng) */}
      <div
        className={cn(
          'mb-3 flex items-center justify-between gap-3 rounded-2xl border border-ivory-200 bg-card px-4 py-3 text-sm text-ink/60 lg:px-5',
          COLS,
        )}
      >
        <label className="flex cursor-pointer items-center gap-3 font-medium text-ink">
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
        <span className="hidden text-center lg:block">Xóa</span>
        <button
          type="button"
          disabled={selectedIds.length === 0}
          onClick={askRemoveSelected}
          className="flex items-center gap-1.5 text-sm font-medium text-ink/60 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40 lg:hidden"
        >
          <Trash2 className="size-4" />
          Xóa đã chọn
        </button>
      </div>

      <div className="space-y-4">
        {cart.shops.map((group) => (
          <ShopGroup
            key={group.shop.id}
            group={group}
            onSelect={(itemIds, selected) => select.mutate({ itemIds, selected })}
          />
        ))}
      </div>

      {/* Thanh tổng cố định ở đáy màn hình khi cuộn */}
      <div className="sticky bottom-0 z-20 -mx-4 mt-5 px-4 pb-3 pt-2 md:pb-4">
        <div className="rounded-2xl border border-champagne/40 bg-card/95 px-4 py-3 shadow-[0_-12px_32px_-16px_rgba(23,37,84,0.35)] backdrop-blur md:px-5 md:py-4">
          <div className="flex items-center gap-3 md:gap-5">
            <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-sm font-medium text-ink">
              <Checkbox
                checked={allSelected}
                disabled={choosable.length === 0}
                onCheckedChange={toggleAll}
                aria-label="Chọn tất cả"
                className="size-[18px]"
              />
              <span className="hidden sm:inline">Chọn tất cả</span>
              <span className="sm:hidden">Tất cả</span>
            </label>
            <div className="hidden items-center gap-4 text-sm md:flex">
              <button
                type="button"
                disabled={selectedIds.length === 0 || removeMany.isPending}
                onClick={askRemoveSelected}
                className="text-ink/60 hover:text-red-600 disabled:pointer-events-none disabled:opacity-40"
              >
                Xóa mục đã chọn
              </button>
              {unavailableIds.length > 0 && (
                <button
                  type="button"
                  onClick={askRemoveUnavailable}
                  className="text-ink/60 hover:text-red-600"
                >
                  Xóa sản phẩm không còn bán
                </button>
              )}
            </div>
            <div className="ml-auto min-w-0 text-right">
              <div className="flex flex-wrap items-baseline justify-end gap-x-2">
                <span className="text-xs text-ink/60 sm:text-sm">
                  Tổng ({cart.selectedCount} sản phẩm):
                </span>
                <span className="text-xl font-bold text-navy md:text-2xl">
                  {formatMoney(cart.selectedTotal)}
                </span>
              </div>
              {savings > 0 && (
                <div className="text-xs text-champagne-600 sm:text-sm">
                  Tiết kiệm {formatMoney(savings)}
                </div>
              )}
            </div>
          </div>
          <div className="mt-2.5 flex flex-col gap-2 border-t border-ivory-200 pt-2.5 sm:flex-row sm:items-center sm:justify-end">
            {blocked > 0 && (
              <span className="flex items-center justify-center gap-1.5 text-xs text-amber-700 sm:mr-auto">
                <Info className="size-3.5 shrink-0" />
                {blocked} sản phẩm đã chọn cần sửa (hết hàng hoặc vượt tồn)
              </span>
            )}
            <Button
              size="lg"
              className="h-11 rounded-xl px-10 text-[15px]"
              disabled={buyIds.length === 0 || blocked > 0}
              onClick={() => navigate(`/dat-hang?items=${buyIds.join(',')}`)}
            >
              Mua hàng ({buyIds.length})
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">{confirm?.title}</DialogTitle>
            <DialogDescription>{confirm?.text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              Giữ lại
            </Button>
            <Button variant="destructive" onClick={doRemove}>
              <Trash2 className="size-4" />
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
    <section className="overflow-hidden rounded-2xl border border-ivory-200 bg-card">
      <header className="flex items-center gap-3 border-b border-ivory-200 bg-ivory/50 px-4 py-3 lg:px-5">
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
          className="group flex min-w-0 items-center gap-2.5 font-semibold text-navy"
        >
          <ShopLogo
            url={group.shop.logoUrl}
            className="size-7 rounded-lg border border-ivory-200"
          />
          <span className="truncate group-hover:underline">{group.shop.name}</span>
          <ChevronRight className="size-4 shrink-0 text-ink/40" />
        </Link>
      </header>
      <div className="divide-y divide-ivory-200">
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

  return (
    <div className={cn('relative px-4 py-4 lg:px-5', COLS, greyed && 'bg-ivory/40')}>
      {/* Sản phẩm */}
      <div className="flex min-w-0 gap-3 lg:items-center">
        <Checkbox
          checked={item.selected && !unavailable}
          disabled={unavailable}
          onCheckedChange={onToggle}
          aria-label={`Chọn ${item.productName}`}
          className="mt-7 size-[18px] lg:mt-0"
        />
        <Link
          to={productLink}
          className={cn(
            'relative flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1.5 lg:size-24',
            greyed && 'opacity-50 grayscale',
          )}
        >
          {item.image ? (
            <img src={item.image} alt={item.productName} className="size-full object-contain" />
          ) : (
            <ImageOff className="size-6 text-ink/25" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link
              to={productLink}
              className={cn(
                'line-clamp-2 flex-1 text-sm font-medium leading-5 text-ink hover:text-navy',
                greyed && 'text-ink/50',
              )}
            >
              {item.productName}
            </Link>
            {/* Nút xóa trên điện thoại: góc phải cạnh tên */}
            <button
              type="button"
              aria-label="Xóa"
              onClick={onRemove}
              disabled={remove.isPending}
              className="-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink/45 transition hover:bg-red-50 hover:text-red-600 lg:hidden"
            >
              {remove.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Trash2 className="size-4" />
              )}
            </button>
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

          {/* Giá, số lượng, thành tiền trên điện thoại */}
          <div className="mt-2 lg:hidden">
            <span className={cn('text-base font-bold text-navy', greyed && 'text-ink/45')}>
              {formatMoney(item.price)}
            </span>
            {hasDiscount && (
              <span className="ml-1.5 text-xs text-ink/40 line-through">
                {formatMoney(item.originalPrice!)}
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 lg:hidden">
            {stepper || <span className="text-sm text-ink/45">Số lượng: {item.quantity}</span>}
            {!greyed && item.quantity > 1 && (
              <div className="text-right leading-tight">
                <div className="text-[11px] text-ink/45">Thành tiền</div>
                <div
                  className={cn(
                    'text-sm font-bold text-navy',
                    item.state === 'NOT_ENOUGH_STOCK' && 'text-ink/40',
                  )}
                >
                  {formatMoney(item.price * item.quantity)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Các cột trên màn rộng */}
      <div className="hidden text-center lg:block">
        <div className={cn('font-semibold text-ink', greyed && 'text-ink/45')}>
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
          'hidden text-center font-bold text-navy lg:block',
          (greyed || item.state === 'NOT_ENOUGH_STOCK') && 'text-ink/40',
        )}
      >
        {formatMoney(item.price * item.quantity)}
      </div>
      <div className="hidden justify-center lg:flex">
        <button
          type="button"
          aria-label="Xóa"
          onClick={onRemove}
          disabled={remove.isPending}
          className="flex size-9 items-center justify-center rounded-lg text-ink/45 transition hover:bg-red-50 hover:text-red-600"
        >
          {remove.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

/** Ghi chú tình trạng dòng: thiếu hàng (kèm nút giảm số lượng), hết hàng, không còn bán */
function StateNote({ item, onReduce }: { item: CartItem; onReduce: () => void }) {
  if (item.state === 'NOT_ENOUGH_STOCK') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="size-3.5" />
          Chỉ còn {item.available} sản phẩm
        </span>
        <button
          type="button"
          onClick={onReduce}
          className="rounded-md border border-navy/25 bg-card px-2 py-[3px] font-semibold text-navy transition hover:bg-navy hover:text-white"
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

function EmptyCart() {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-ivory-200 bg-card px-6 py-16 text-center md:py-24">
      <span className="relative flex size-24 items-center justify-center rounded-full bg-champagne-50 text-champagne-600 ring-[12px] ring-champagne-50/50">
        <ShoppingBag className="size-10" strokeWidth={1.5} />
      </span>
      <h1 className="mt-7 text-xl font-bold text-navy">Giỏ hàng của bạn đang trống</h1>
      <p className="mt-2 max-w-sm text-sm text-ink/60">
        Dạo một vòng các shop trên sàn và thêm món bạn thích vào giỏ nhé.
      </p>
      <Button asChild size="lg" className="mt-7 h-12 rounded-xl px-8 text-[15px]">
        <Link to="/">
          <ShoppingBag className="size-5" />
          Tiếp tục mua sắm
        </Link>
      </Button>
    </div>
  );
}

function CartSkeleton() {
  return (
    <div>
      <Skeleton className="mb-5 h-10 w-56 rounded-xl" />
      <Skeleton className="mb-3 h-12 w-full rounded-2xl" />
      {Array.from({ length: 2 }, (_, i) => (
        <div key={i} className="mb-4 rounded-2xl border border-ivory-200 bg-card p-4">
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
  );
}
