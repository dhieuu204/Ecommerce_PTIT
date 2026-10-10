import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ChevronRight,
  CreditCard,
  ImageOff,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  TicketPercent,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { MoneyRow, SHIPPING_SOURCE } from '@/components/orders/order-parts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { CART_KEY } from '@/hooks/use-cart';
import { API, ApiError, api } from '@/lib/api';
import { formatMoney } from '@/lib/format';
import type { CheckoutPreview, CheckoutShop, PaymentLink, PlacedOrder } from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { AddressCard, AddressDialog, VoucherDialog } from './checkout-parts';

/** Lựa chọn của buyer gửi lên bản xem trước. undefined = để máy chủ tự chọn voucher tốt nhất */
interface Choices {
  addressId?: string;
  shopVouchers?: Record<string, string | null>;
  platformVoucherCode?: string | null;
}

const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

/**
 * Tạo lần thanh toán rồi chuyển buyer sang VNPay (hoặc trang MÔ PHỎNG). payment-service có thể chưa kịp
 * nhận đơn (sự kiện đi qua RabbitMQ) → ORDER_NOT_READY thì thử lại vài lần.
 */
export async function startPayment(orderId: string): Promise<PaymentLink> {
  const key = crypto.randomUUID();
  for (let i = 0; ; i++) {
    try {
      return await api<PaymentLink>(`${API.market}/orders/${orderId}/pay`, {
        method: 'POST',
        idempotencyKey: key,
      });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'ORDER_NOT_READY' && i < 8) {
        await sleep(800);
        continue;
      }
      throw e;
    }
  }
}

/**
 * Trang Thanh toán (ORD-01, VCH-02, SHIP-01): địa chỉ, hàng tách theo shop kèm voucher shop và phí ship,
 * voucher sàn, phương thức thanh toán, tổng tiền. Bấm Đặt hàng → tạo đơn → sang cổng thanh toán.
 */
export function CheckoutPage() {
  const [params] = useSearchParams();
  const itemIds = (params.get('items') ?? '').split(',').filter(Boolean);
  const [choices, setChoices] = useState<Choices>({});
  const navigate = useNavigate();
  const qc = useQueryClient();

  const preview = useQuery({
    queryKey: ['checkout', itemIds, choices],
    queryFn: () =>
      api<CheckoutPreview>(`${API.market}/checkout/preview`, {
        method: 'POST',
        body: { itemIds, ...toBody(choices) },
      }),
    enabled: itemIds.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });

  const [addressOpen, setAddressOpen] = useState(false);
  const [voucherFor, setVoucherFor] = useState<CheckoutShop | 'PLATFORM' | null>(null);
  const [placing, setPlacing] = useState<null | 'ORDER' | 'PAY'>(null);
  const [changed, setChanged] = useState<string[] | null>(null);

  const data = preview.data;

  /** Đổi voucher của một shop: giữ nguyên lựa chọn hiện tại của các shop khác */
  const pickShopVoucher = (shopId: string, code: string | null) => {
    if (!data) return;
    const current = Object.fromEntries(
      data.shops.map((s) => [s.shop.id, s.shopVoucher?.code ?? null]),
    );
    setChoices((c) => ({
      ...c,
      shopVouchers: { ...current, [shopId]: code },
      platformVoucherCode: c.platformVoucherCode ?? data.platformVoucher?.code ?? null,
    }));
  };
  const pickPlatformVoucher = (code: string | null) => {
    if (!data) return;
    setChoices((c) => ({
      ...c,
      shopVouchers:
        c.shopVouchers ??
        Object.fromEntries(data.shops.map((s) => [s.shop.id, s.shopVoucher?.code ?? null])),
      platformVoucherCode: code,
    }));
  };

  const place = async () => {
    if (!data?.canPlace || placing) return;
    setPlacing('ORDER');
    let order: PlacedOrder;
    try {
      order = await api<PlacedOrder>(`${API.market}/orders`, {
        method: 'POST',
        body: { checkoutId: data.checkoutId },
      });
    } catch (e) {
      setPlacing(null);
      if (e instanceof ApiError && e.code === 'CHECKOUT_CHANGED') {
        setChanged((e.details.problems as string[] | undefined) ?? [e.message]);
      } else if (e instanceof ApiError && e.code === 'CHECKOUT_EXPIRED') {
        toast.info('Phiên đặt hàng đã hết hạn, đơn vừa được tính lại.');
      } else {
        toast.error(e instanceof Error ? e.message : 'Chưa đặt được hàng, bạn thử lại.');
      }
      void qc.invalidateQueries({ queryKey: ['checkout'] });
      return;
    }
    void qc.invalidateQueries({ queryKey: CART_KEY });
    setPlacing('PAY');
    try {
      const link = await startPayment(order.orderId);
      window.location.assign(link.payUrl);
    } catch (e) {
      toast.error('Đã đặt hàng nhưng chưa mở được trang thanh toán.', {
        description: `${e instanceof Error ? e.message : ''} Bạn thanh toán lại trong Đơn mua.`,
      });
      navigate(`/tai-khoan/don-mua/${order.orderId}`, { replace: true });
    }
  };

  if (itemIds.length === 0) {
    return (
      <Shell>
        <EmptyState
          className="rounded-3xl border border-ivory-200 bg-card"
          icon={ShoppingBag}
          title="Chưa chọn sản phẩm để thanh toán"
          text="Bạn quay lại giỏ hàng, tick các sản phẩm muốn mua rồi bấm Mua hàng."
          action={
            <Button asChild>
              <Link to="/gio-hang">Về giỏ hàng</Link>
            </Button>
          }
        />
      </Shell>
    );
  }

  if (preview.isError && !data) {
    const e = preview.error;
    const needAddress = e instanceof ApiError && e.code === 'ADDRESS_REQUIRED';
    return (
      <Shell>
        {needAddress ? (
          <EmptyState
            className="rounded-3xl border border-ivory-200 bg-card"
            icon={Truck}
            title="Bạn chưa có địa chỉ nhận hàng"
            text="Thêm một địa chỉ trong Sổ địa chỉ rồi quay lại thanh toán."
            action={
              <Button asChild>
                <Link to="/tai-khoan/dia-chi">Thêm địa chỉ</Link>
              </Button>
            }
          />
        ) : (
          <LoadError
            className="rounded-3xl border border-ivory-200 bg-card"
            message={e.message}
            onRetry={() => preview.refetch()}
          />
        )}
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <CheckoutSkeleton />
      </Shell>
    );
  }

  const busy = preview.isFetching;
  const voucherErrors = data.voucherErrors;

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-4">
          <AddressCard
            receiverName={data.address.receiverName}
            phone={data.address.phone}
            fullAddress={data.address.fullAddress}
            onChange={() => setAddressOpen(true)}
          />

          {data.problems.length > 0 && (
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 size-5 shrink-0" />
              <div>
                <div className="font-semibold">Một số sản phẩm cần sửa trước khi đặt hàng</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {data.problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
                <Link
                  to="/gio-hang"
                  className="mt-2 inline-block font-semibold text-navy underline"
                >
                  Về giỏ hàng để sửa
                </Link>
              </div>
            </div>
          )}

          {data.shops.map((s) => (
            <ShopBlock
              key={s.shop.id}
              shop={s}
              error={voucherErrors.find((v) => v.shopId === s.shop.id)?.message}
              onVoucher={() => setVoucherFor(s)}
            />
          ))}

          {/* Voucher sàn */}
          <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-champagne-50 text-champagne-600">
                <TicketPercent className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-navy">Voucher của sàn</div>
                <div className="text-xs text-ink/55">
                  Giảm trên tiền hàng, chia cho từng shop theo tỉ lệ tiền hàng
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoucherFor('PLATFORM')}
                className="shrink-0 text-sm font-semibold text-champagne-600 hover:text-navy"
              >
                {data.platformVoucher ? 'Đổi mã' : 'Chọn hoặc nhập mã'}
              </button>
            </div>
            {data.platformVoucher && (
              <div className="mt-3 flex items-center justify-between rounded-xl border border-dashed border-champagne bg-champagne-50/50 px-3 py-2 text-sm">
                <span>
                  <b className="text-navy">{data.platformVoucher.code}</b>
                  <span className="text-ink/60"> · {data.platformVoucher.name}</span>
                </span>
                <span className="font-semibold text-champagne-600">
                  −{formatMoney(data.platformVoucher.discount)}
                </span>
              </div>
            )}
            {voucherErrors
              .filter((v) => v.shopId === null)
              .map((v) => (
                <p key={v.code} className="mt-2 text-xs text-red-600">
                  Mã {v.code}: {v.message}
                </p>
              ))}
          </section>

          {/* Phương thức thanh toán: P3 chỉ trả trước qua VNPay */}
          <section className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
            <div className="mb-3 font-semibold text-navy">Phương thức thanh toán</div>
            <div className="flex items-center gap-3 rounded-xl border border-navy bg-navy/[0.03] px-3 py-3 ring-1 ring-navy">
              <span className="flex size-10 items-center justify-center rounded-lg bg-white text-navy shadow-sm">
                <CreditCard className="size-5" />
              </span>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold text-ink">Thanh toán online qua VNPay</div>
                <div className="text-xs text-ink/55">
                  Thẻ ATM, thẻ quốc tế, QR ngân hàng. Đơn chưa thanh toán sẽ tự hủy khi hết hạn.
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Tổng tiền: cột phải trên máy tính, dính đáy trên điện thoại */}
        <aside className="lg:sticky lg:top-28">
          <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
            <div className="mb-2 font-semibold text-navy">Chi tiết thanh toán</div>
            <MoneyRow label="Tổng tiền hàng" value={data.subtotal} />
            <MoneyRow label="Phí vận chuyển" value={data.shippingFee} />
            <MoneyRow label="Voucher của shop" value={data.shopDiscount} minus />
            <MoneyRow label="Voucher của sàn" value={data.platformDiscount} minus />
            <div className="my-2 border-t border-ivory-200" />
            <MoneyRow label="Tổng thanh toán" value={data.total} strong />
            <div className="mt-3 hidden lg:block">
              <PlaceButton disabled={!data.canPlace || busy} placing={placing} onClick={place} />
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink/50">
              <ShieldCheck className="mt-px size-3.5 shrink-0 text-emerald-600" />
              Đơn từ 10 triệu có thể cần sàn kiểm tra trước khi shop xử lý.
            </p>
          </div>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-5 px-4 pb-3 pt-2 lg:hidden">
        <div className="flex items-center gap-3 rounded-2xl border border-champagne/40 bg-card/95 px-4 py-3 shadow-[0_-12px_32px_-16px_rgba(23,37,84,0.35)] backdrop-blur">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-ink/55">Tổng thanh toán</div>
            <div className="text-xl font-bold text-navy">{formatMoney(data.total)}</div>
          </div>
          <PlaceButton
            disabled={!data.canPlace || busy}
            placing={placing}
            onClick={place}
            className="w-auto px-6"
          />
        </div>
      </div>

      <AddressDialog
        open={addressOpen}
        onOpenChange={setAddressOpen}
        currentId={data.address.id}
        onPick={(id) => setChoices((c) => ({ ...c, addressId: id }))}
      />
      <VoucherDialog
        open={voucherFor !== null}
        onOpenChange={(o) => !o && setVoucherFor(null)}
        title={
          voucherFor === 'PLATFORM'
            ? 'Voucher của sàn'
            : `Voucher của ${voucherFor?.shop.name ?? 'shop'}`
        }
        options={voucherFor === 'PLATFORM' ? data.platformVouchers : (voucherFor?.vouchers ?? [])}
        current={
          voucherFor === 'PLATFORM'
            ? (data.platformVoucher?.code ?? null)
            : (voucherFor?.shopVoucher?.code ?? null)
        }
        allowCode={voucherFor === 'PLATFORM'}
        onPick={(code) =>
          voucherFor === 'PLATFORM'
            ? pickPlatformVoucher(code)
            : voucherFor && pickShopVoucher(voucherFor.shop.id, code)
        }
      />
      <Dialog open={!!changed} onOpenChange={(o) => !o && setChanged(null)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Đơn hàng có thay đổi</DialogTitle>
            <DialogDescription>
              Chưa có đơn nào được tạo. Tiền đã được tính lại, bạn xem lại rồi đặt hàng.
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink/80">
            {changed?.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setChanged(null)}>Xem lại đơn</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Shell>
  );
}

function toBody(c: Choices) {
  const body: Record<string, unknown> = {};
  if (c.addressId) body.addressId = c.addressId;
  if (c.shopVouchers) {
    body.shopVouchers = Object.entries(c.shopVouchers).map(([shopId, code]) => ({ shopId, code }));
  }
  if (c.platformVoucherCode !== undefined) body.platformVoucherCode = c.platformVoucherCode;
  return body;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-5 md:pt-8">
      <nav className="mb-3 flex items-center gap-1.5 text-sm text-ink/55">
        <Link to="/" className="hover:text-navy">
          Trang chủ
        </Link>
        <ChevronRight className="size-3.5 text-ink/30" />
        <Link to="/gio-hang" className="hover:text-navy">
          Giỏ hàng
        </Link>
        <ChevronRight className="size-3.5 text-ink/30" />
        <span className="text-ink">Thanh toán</span>
      </nav>
      <h1 className="mb-5 flex items-center gap-3 text-2xl font-bold text-navy md:text-[1.75rem]">
        <span className="flex size-10 items-center justify-center rounded-2xl bg-navy text-champagne">
          <CreditCard className="size-5" />
        </span>
        Thanh toán
      </h1>
      {children}
    </div>
  );
}

function PlaceButton({
  disabled,
  placing,
  onClick,
  className,
}: {
  disabled: boolean;
  placing: null | 'ORDER' | 'PAY';
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      size="lg"
      className={cn('h-12 w-full rounded-xl text-[15px]', className)}
      disabled={disabled || placing !== null}
      onClick={onClick}
    >
      {placing && <Loader2 className="size-5 animate-spin" />}
      {placing === 'ORDER'
        ? 'Đang đặt hàng…'
        : placing === 'PAY'
          ? 'Đang mở trang thanh toán…'
          : 'Đặt hàng'}
    </Button>
  );
}

function ShopBlock({
  shop,
  error,
  onVoucher,
}: {
  shop: CheckoutShop;
  error?: string;
  onVoucher: () => void;
}) {
  const eligible = shop.vouchers.filter((v) => v.eligible).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-ivory-200 bg-card">
      <header className="flex items-center gap-2.5 border-b border-ivory-200 bg-ivory/50 px-4 py-3 md:px-5">
        <ShopLogo url={shop.shop.logoUrl} className="size-7 rounded-lg border border-ivory-200" />
        <Link
          to={`/shop/${shop.shop.id}`}
          className="truncate font-semibold text-navy hover:underline"
        >
          {shop.shop.name}
        </Link>
      </header>
      <div className="divide-y divide-ivory-200 px-4 md:px-5">
        {shop.items.map((it) => (
          <div
            key={it.cartItemId}
            className={cn('flex gap-3 py-3', it.state !== 'OK' && 'opacity-60')}
          >
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 p-1">
              {it.image ? (
                <img src={it.image} alt={it.productName} className="size-full object-contain" />
              ) : (
                <ImageOff className="size-5 text-ink/25" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm font-medium text-ink">{it.productName}</div>
              {it.variantName && (
                <div className="mt-0.5 text-xs text-ink/55">Phân loại: {it.variantName}</div>
              )}
              <div className="mt-1 text-xs text-ink/55">
                {formatMoney(it.price)} × {it.quantity}
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold text-navy">
              {formatMoney(it.lineTotal)}
            </div>
          </div>
        ))}
      </div>
      <div className="space-y-2 border-t border-ivory-200 bg-ivory/30 px-4 py-3 text-sm md:px-5">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-ink/70">
            <TicketPercent className="size-4 text-champagne-600" />
            Voucher của shop
          </span>
          <button
            type="button"
            onClick={onVoucher}
            className="text-right font-medium text-champagne-600 hover:text-navy"
          >
            {shop.shopVoucher
              ? `${shop.shopVoucher.code} · −${formatMoney(shop.shopVoucher.discount)}`
              : eligible > 0
                ? `${eligible} mã dùng được`
                : shop.vouchers.length > 0
                  ? 'Xem voucher'
                  : 'Không có voucher'}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-ink/70">
            <Truck className="size-4 text-champagne-600" />
            Vận chuyển
            <span className="text-xs text-ink/45">({SHIPPING_SOURCE[shop.shippingFeeSource]})</span>
          </span>
          <span className="font-medium text-ink">{formatMoney(shop.shippingFee)}</span>
        </div>
        {shop.platformDiscount > 0 && (
          <div className="flex items-center justify-between gap-3 text-xs text-ink/55">
            <span>Phần voucher sàn chia cho shop này</span>
            <span>−{formatMoney(shop.platformDiscount)}</span>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-dashed border-ivory-200 pt-2">
          <span className="text-ink/70">
            Tổng ({shop.items.reduce((a, i) => a + i.quantity, 0)} sản phẩm)
          </span>
          <span className="text-base font-bold text-navy">{formatMoney(shop.total)}</span>
        </div>
      </div>
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
