import {
  IconAlertTriangle,
  IconCheck,
  IconChevronRight,
  IconHome,
  IconLoader2,
  IconMapPin,
  IconPhotoOff,
  IconRosetteDiscountCheckFilled,
  IconShieldCheck,
  IconShoppingBag,
  IconTicket,
  IconTruck,
} from '@tabler/icons-react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { SHIPPING_SOURCE } from '@/components/orders/order-parts';
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
import { toastCartError } from '@/lib/cart-errors';
import type { Cart } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import type {
  CheckoutLine,
  CheckoutPreview,
  CheckoutShop,
  PaymentLink,
  PaymentMethod,
  PlacedOrder,
} from '@/lib/order-types';
import { cn } from '@/lib/utils';
import { VariantPopover } from '@/pages/cart/variant-switcher';
import {
  AddressCard,
  AddressDialog,
  CARD,
  CardTitle,
  CornerTick,
  PRIMARY_BUTTON,
  TicketStub,
  VoucherDialog,
} from './checkout-parts';

/** Lựa chọn của buyer gửi lên bản xem trước. undefined = để máy chủ tự chọn voucher tốt nhất */
interface Choices {
  addressId?: string;
  shopVouchers?: Record<string, string | null>;
  platformVoucherCode?: string | null;
  paymentMethod?: PaymentMethod;
}

/** Cột của dòng hàng trên màn rộng: sản phẩm | đơn giá | số lượng | thành tiền */
const COLS = 'lg:grid lg:grid-cols-[minmax(0,1fr)_8rem_7.5rem_8rem] lg:items-center lg:gap-3';

/** Chờ khách bấm xong +/− rồi mới lưu, tránh tính lại phí GHN sau mỗi lần bấm */
const QUANTITY_SAVE_DELAY = 400;

/** Sửa dòng hàng ngay trên trang đặt hàng */
interface LineEdit {
  /** Đang lưu một thay đổi khác: tạm khóa đổi phân loại */
  locked: boolean;
  /** Dòng đang đổi phân loại */
  switching: string | null;
  trackSaving: (delta: 1 | -1) => void;
  saveQuantity: (line: CheckoutLine, quantity: number) => Promise<void>;
  changeVariant: (line: CheckoutLine, variantId: string) => void;
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
 * Rời sang cổng thanh toán. backTo: trang thay chỗ trang hiện tại trong lịch sử, để bấm quay lại từ cổng về
 * đúng đơn vừa tạo. Trình duyệt có thể phục hồi nguyên trang cũ khi quay lại (nút còn đang quay) nên tải lại.
 */
export function openPayUrl(payUrl: string, backTo?: string) {
  if (backTo) window.history.replaceState(null, '', backTo);
  window.addEventListener(
    'pageshow',
    (e) => {
      if (e.persisted) window.location.reload();
    },
    { once: true },
  );
  window.location.assign(payUrl);
}

/**
 * Trang Đặt hàng (ORD-01, VCH-02, SHIP-01, COD-01), bố cục theo các sàn lớn: cột trái địa chỉ, hàng tách theo
 * shop kèm voucher shop và phí ship, voucher sàn, phương thức thanh toán; cột phải chi tiết tiền bám theo khi
 * cuộn. Bấm Đặt hàng → tạo đơn → sang cổng thanh toán (VNPay) hoặc tới trang đơn (COD).
 */
export function CheckoutPage() {
  const [params, setParams] = useSearchParams();
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
  /** Số thay đổi số lượng/phân loại chưa lưu xong: còn thì chưa cho đặt hàng */
  const [saving, setSaving] = useState(0);
  const [switching, setSwitching] = useState<string | null>(null);
  const trackSaving = useCallback((delta: 1 | -1) => setSaving((n) => n + delta), []);

  const data = preview.data;

  const lineUrl = (id: string) => `${API.market}/cart/items/${id}`;
  /** Tính lại tiền và phí ship sau khi sửa dòng hàng */
  const refreshAfterEdit = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['checkout'] }),
      qc.invalidateQueries({ queryKey: CART_KEY }),
    ]);

  const saveQuantity = async (line: CheckoutLine, quantity: number) => {
    try {
      await api<Cart>(lineUrl(line.cartItemId), { method: 'PATCH', body: { quantity } });
    } catch (e) {
      toastCartError(e);
      throw e;
    } finally {
      await refreshAfterEdit();
    }
  };

  const changeVariant = async (line: CheckoutLine, variantId: string) => {
    trackSaving(1);
    setSwitching(line.cartItemId);
    try {
      const cart = await api<Cart>(lineUrl(line.cartItemId), {
        method: 'PATCH',
        body: { variantId },
      });
      const next = cart.shops.flatMap((g) => g.items).find((it) => it.variantId === variantId);
      // Phân loại mới đã có dòng riêng trong giỏ: máy chủ gộp vào dòng đó và xóa dòng này
      if (next && next.id !== line.cartItemId) {
        const inOrder = itemIds.includes(next.id);
        // Dòng kia không thuộc đơn này thì vẫn mua đúng số khách đang chọn, không cộng dồn
        if (!inOrder && next.quantity !== line.quantity) {
          await api<Cart>(lineUrl(next.id), {
            method: 'PATCH',
            body: { quantity: line.quantity },
          });
        }
        const ids = inOrder
          ? itemIds.filter((id) => id !== line.cartItemId)
          : itemIds.map((id) => (id === line.cartItemId ? next.id : id));
        setParams({ items: ids.join(',') }, { replace: true });
      }
      toast.success('Đã đổi phân loại.');
    } catch (e) {
      toastCartError(e);
    } finally {
      setSwitching(null);
      await refreshAfterEdit();
      trackSaving(-1);
    }
  };

  const edit: LineEdit = {
    locked: saving > 0,
    switching,
    trackSaving,
    saveQuantity,
    changeVariant: (line, variantId) => void changeVariant(line, variantId),
  };

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
    if (data.paymentMethod === 'COD') {
      toast.success('Đặt hàng thành công!', {
        description: 'Bạn thanh toán bằng tiền mặt khi nhận hàng.',
      });
      navigate(`/tai-khoan/don-mua/${order.orderId}`, { replace: true });
      return;
    }
    setPlacing('PAY');
    try {
      const link = await startPayment(order.orderId);
      openPayUrl(link.payUrl, `/tai-khoan/don-mua/${order.orderId}`);
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
        <Notice
          icon={IconShoppingBag}
          title="Chưa chọn sản phẩm để đặt hàng"
          text="Bạn quay lại giỏ hàng, chọn các sản phẩm muốn mua rồi bấm Mua hàng."
          to="/gio-hang"
          action="Về giỏ hàng"
        />
      </Shell>
    );
  }

  if (preview.isError && !data) {
    const e = preview.error;
    const needAddress = e instanceof ApiError && e.code === 'ADDRESS_REQUIRED';
    // Các dòng giỏ trên đường dẫn không còn: thường là đã đặt hàng xong
    const noLines = e instanceof ApiError && e.code === 'EMPTY_CHECKOUT';
    return (
      <Shell>
        {noLines ? (
          <Notice
            icon={IconShoppingBag}
            title="Các sản phẩm này không còn trong giỏ"
            text="Có thể bạn đã đặt hàng rồi. Bạn xem và thanh toán tiếp trong Đơn mua."
            to="/tai-khoan/don-mua"
            action="Xem đơn mua"
          />
        ) : needAddress ? (
          <Notice
            icon={IconMapPin}
            title="Bạn chưa có địa chỉ nhận hàng"
            text="Thêm một địa chỉ trong Sổ địa chỉ rồi quay lại đặt hàng."
            to="/tai-khoan/dia-chi"
            action="Thêm địa chỉ"
          />
        ) : (
          <LoadError className={CARD} message={e.message} onRetry={() => preview.refetch()} />
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

  const busy = preview.isFetching || saving > 0;
  const voucherErrors = data.voucherErrors;
  const itemCount = data.shops.reduce(
    (sum, s) => sum + s.items.reduce((a, i) => a + i.quantity, 0),
    0,
  );
  const saved = data.shopDiscount + data.platformDiscount;
  const eligiblePlatform = data.platformVouchers.filter((v) => v.eligible).length;

  return (
    <Shell>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="min-w-0 space-y-4">
          <AddressCard
            receiverName={data.address.receiverName}
            phone={data.address.phone}
            fullAddress={data.address.fullAddress}
            onChange={() => setAddressOpen(true)}
          />

          {data.problems.length > 0 && (
            <div className="flex gap-3 rounded-2xl bg-champagne-50 px-4 py-3 text-sm text-charcoal ring-1 ring-champagne/40">
              <IconAlertTriangle className="mt-0.5 size-5 shrink-0 text-champagne-600 [stroke-width:1.75]" />
              <div>
                <div className="font-semibold">Một số sản phẩm cần sửa trước khi đặt hàng</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ink/75">
                  {data.problems.map((p, i) => (
                    <li key={i}>{p.message}</li>
                  ))}
                </ul>
                <Link to="/gio-hang" className="mt-2 inline-block font-semibold text-navy">
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
              edit={edit}
            />
          ))}

          {/* Voucher sàn */}
          <section className={cn(CARD, 'px-4 py-4 lg:px-5')}>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Voucher của sàn</CardTitle>
              <button
                type="button"
                onClick={() => setVoucherFor('PLATFORM')}
                className="group flex shrink-0 items-center gap-0.5 text-sm font-semibold text-navy transition hover:text-navy-900"
              >
                {data.platformVoucher
                  ? 'Đổi mã'
                  : eligiblePlatform > 0
                    ? `${eligiblePlatform} mã dùng được`
                    : 'Nhập mã'}
                <IconChevronRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
              </button>
            </div>
            {data.platformVoucher && (
              <div className="mt-3 flex overflow-hidden rounded-lg border border-navy/25 bg-champagne-50">
                <TicketStub className="w-14">
                  <IconTicket className="size-5 [stroke-width:1.75]" />
                </TicketStub>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="font-bold text-charcoal">{data.platformVoucher.code}</div>
                    <div className="truncate text-xs text-ink/60">{data.platformVoucher.name}</div>
                  </div>
                  <span className="shrink-0 font-bold text-navy">
                    -{formatMoney(data.platformVoucher.discount)}
                  </span>
                </div>
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

          {/* Phương thức thanh toán: VNPay hoặc COD (khi mọi shop trong đơn nhận COD) */}
          <section className={cn(CARD, 'px-4 py-4 lg:px-5')}>
            <CardTitle>Phương thức thanh toán</CardTitle>
            <div
              className="mt-3.5 grid gap-3 sm:grid-cols-2"
              role="radiogroup"
              aria-label="Phương thức"
            >
              <MethodOption
                selected={data.paymentMethod === 'VNPAY'}
                logo="/partners/vnpay.svg"
                title="Thanh toán qua VNPay"
                text="Thẻ ATM, thẻ quốc tế, QR ngân hàng"
                onSelect={() => setChoices((c) => ({ ...c, paymentMethod: 'VNPAY' }))}
              />
              <MethodOption
                selected={data.paymentMethod === 'COD'}
                disabled={!data.codAvailable && data.paymentMethod !== 'COD'}
                logo="/partners/cod.svg"
                title="Thanh toán khi nhận hàng"
                text={
                  data.codAvailable
                    ? data.shops.length > 1
                      ? 'Trả tiền mặt cho từng kiện hàng của mỗi shop'
                      : 'Trả tiền mặt cho nhân viên giao hàng'
                    : 'Có shop trong đơn không nhận COD'
                }
                onSelect={() => setChoices((c) => ({ ...c, paymentMethod: 'COD' }))}
              />
            </div>
          </section>
        </div>

        {/* Chi tiết tiền: cột phải trên máy tính */}
        <aside className={cn(CARD, 'p-5 lg:sticky lg:top-20')}>
          <CardTitle>Chi tiết thanh toán</CardTitle>
          <dl className={cn('mt-4 space-y-2.5 text-sm transition-opacity', busy && 'opacity-50')}>
            <SummaryRow label={`Tổng tiền hàng (${itemCount} sản phẩm)`} value={data.subtotal} />
            <SummaryRow label="Phí vận chuyển" value={data.shippingFee} />
            {data.shopDiscount > 0 && (
              <SummaryRow label="Voucher của shop" value={data.shopDiscount} minus />
            )}
            {data.platformDiscount > 0 && (
              <SummaryRow label="Voucher của sàn" value={data.platformDiscount} minus />
            )}
          </dl>
          <div className="mt-4 border-t border-dashed border-ink/15 pt-4">
            <div className="flex items-end justify-between gap-3">
              <span className="text-sm font-medium text-charcoal">Tổng thanh toán</span>
              <span
                className={cn(
                  'text-2xl leading-none font-bold tracking-tight text-navy transition-opacity',
                  busy && 'opacity-50',
                )}
              >
                {formatMoney(data.total)}
              </span>
            </div>
            {saved > 0 && (
              <p className="mt-1.5 text-right text-xs text-ink/55">
                Tiết kiệm <b className="font-semibold text-navy">{formatMoney(saved)}</b>
              </p>
            )}
          </div>

          {!data.canPlace && data.problems.length > 0 && (
            <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-champagne-600">
              <IconAlertTriangle className="size-4 shrink-0 [stroke-width:1.75]" />
              Sửa các sản phẩm được báo rồi mới đặt được hàng
            </p>
          )}

          <PlaceButton
            disabled={!data.canPlace || busy}
            placing={placing}
            onClick={place}
            className="mt-4 hidden h-12 w-full lg:flex"
          />
          <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink/55">
            <IconShieldCheck className="size-4 shrink-0 text-ship [stroke-width:1.75]" />
            Đơn giá trị lớn có thể cần sàn kiểm tra trước khi shop xử lý.
          </p>
        </aside>
      </div>

      {/* Thanh tổng cố định đáy màn hình (điện thoại, máy tính bảng) */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,26,61,0.25)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-ink/55">Tổng thanh toán</div>
            <div className="truncate text-lg leading-6 font-bold text-navy">
              {formatMoney(data.total)}
            </div>
          </div>
          <PlaceButton
            disabled={!data.canPlace || busy}
            placing={placing}
            onClick={place}
            className="flex h-12 shrink-0 px-7"
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
            <DialogTitle className="text-charcoal">Đơn hàng có thay đổi</DialogTitle>
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
  if (c.paymentMethod) body.paymentMethod = c.paymentMethod;
  return body;
}

function Shell({ children }: { children: React.ReactNode }) {
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
        <Link to="/gio-hang" className="transition hover:text-navy">
          Giỏ hàng
        </Link>
        <IconChevronRight className="size-3.5 text-ink/30" />
        <span className="font-medium text-charcoal">Đặt hàng</span>
      </nav>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">Đặt hàng</h1>
        <Steps />
      </div>
      {children}
    </div>
  );
}

/** Ba bước mua hàng, đang ở bước giữa */
function Steps() {
  const steps = ['Giỏ hàng', 'Đặt hàng', 'Hoàn tất'];
  return (
    <ol className="hidden items-center gap-2.5 text-[13px] sm:flex">
      {steps.map((label, i) => (
        <li key={label} className="flex items-center gap-2.5">
          {i > 0 && (
            <span aria-hidden className={cn('h-px w-8', i === 1 ? 'bg-navy' : 'bg-ink/15')} />
          )}
          <span
            className={cn(
              'flex size-5 items-center justify-center rounded-full text-[11px] font-bold',
              i <= 1 ? 'bg-navy text-white' : 'bg-ink/10 text-ink/50',
            )}
          >
            {i === 0 ? <IconCheck className="size-3 [stroke-width:3]" /> : i + 1}
          </span>
          <span className={cn(i === 1 ? 'font-semibold text-charcoal' : 'text-ink/55')}>
            {label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Notice({
  icon: Icon,
  title,
  text,
  to,
  action,
}: {
  icon: typeof IconShoppingBag;
  title: string;
  text: string;
  to: string;
  action: string;
}) {
  return (
    <div className={cn(CARD, 'flex flex-col items-center px-6 py-16 text-center')}>
      <span className="flex size-20 items-center justify-center rounded-full bg-champagne-50 text-navy">
        <Icon className="size-9 [stroke-width:1.25]" />
      </span>
      <h2 className="mt-5 text-lg font-bold text-charcoal">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-ink/60">{text}</p>
      <Link
        to={to}
        className={cn(PRIMARY_BUTTON, 'mt-6 inline-flex h-11 items-center px-7 text-sm')}
      >
        {action}
      </Link>
    </div>
  );
}

function SummaryRow({ label, value, minus }: { label: string; value: number; minus?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/60">{label}</dt>
      <dd className={cn('shrink-0 font-medium', minus ? 'text-navy' : 'text-charcoal')}>
        {minus ? '-' : ''}
        {formatMoney(value)}
      </dd>
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
    <button
      type="button"
      disabled={disabled || placing !== null}
      onClick={onClick}
      className={cn(PRIMARY_BUTTON, 'items-center justify-center gap-2 text-[15px]', className)}
    >
      {placing && <IconLoader2 className="size-5 animate-spin" />}
      {placing === 'ORDER'
        ? 'Đang đặt hàng…'
        : placing === 'PAY'
          ? 'Đang mở trang thanh toán…'
          : 'Đặt hàng'}
    </button>
  );
}

function MethodOption({
  selected,
  disabled,
  logo,
  title,
  text,
  onSelect,
}: {
  selected: boolean;
  disabled?: boolean;
  logo: string;
  title: string;
  text: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'relative flex items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition',
        selected ? 'border-navy bg-champagne-50' : 'border-ink/15 enabled:hover:border-navy/40',
        disabled && 'cursor-not-allowed opacity-55 grayscale',
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-card p-1.5 ring-1 ring-ink/[0.08]">
        <img src={logo} alt="" className="size-full object-contain" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-charcoal">{title}</span>
        <span className="mt-0.5 block text-xs text-ink/55">{text}</span>
      </span>
      {selected && <CornerTick />}
    </button>
  );
}

/** Một dòng hàng: đổi được số lượng và phân loại ngay tại đây (lưu vào đúng dòng giỏ rồi tính lại đơn) */
function ItemRow({ item, edit }: { item: CheckoutLine; edit: LineEdit }) {
  const greyed = item.state === 'OUT_OF_STOCK' || item.state === 'UNAVAILABLE';
  const unavailable = item.state === 'UNAVAILABLE';
  const hasDiscount = !!item.originalPrice && item.originalPrice > item.price;
  const { trackSaving } = edit;

  // Số lượng hiện ngay khi bấm, lưu sau khi khách dừng bấm
  const [qty, setQty] = useState(item.quantity);
  const timer = useRef<number | null>(null);
  const unsaved = useRef(0);
  useEffect(() => {
    if (unsaved.current === 0) setQty(item.quantity);
  }, [item.quantity]);
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        trackSaving(-1);
      }
    },
    [trackSaving],
  );

  const changeQty = (next: number) => {
    const confirmed = item.quantity;
    setQty(next);
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
    } else {
      unsaved.current += 1;
      trackSaving(1);
    }
    timer.current = window.setTimeout(() => {
      timer.current = null;
      edit
        .saveQuantity(item, next)
        .catch(() => setQty(confirmed))
        .finally(() => {
          unsaved.current -= 1;
          trackSaving(-1);
        });
    }, QUANTITY_SAVE_DELAY);
  };

  const stepper = unavailable ? (
    <span className="text-sm text-ink/45">Số lượng: {qty}</span>
  ) : (
    <QuantityStepper
      size="sm"
      value={qty}
      max={Math.max(item.available, 1)}
      disabled={item.state === 'OUT_OF_STOCK'}
      onChange={changeQty}
    />
  );

  return (
    <div className={cn('px-4 py-4 lg:px-5', COLS, greyed && 'bg-page/60')}>
      <div className="flex min-w-0 gap-3 lg:items-center">
        <Link
          to={`/san-pham/${item.productId}`}
          className={cn(
            'flex size-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card p-1.5 ring-1 ring-ink/[0.08]',
            greyed && 'opacity-50 grayscale',
          )}
        >
          {item.image ? (
            <img src={item.image} alt={item.productName} className="size-full object-contain" />
          ) : (
            <IconPhotoOff className="size-5 text-ink/25" />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            to={`/san-pham/${item.productId}`}
            className="line-clamp-2 text-sm leading-5 font-medium text-charcoal transition hover:text-navy"
          >
            {item.productName}
          </Link>
          {item.variantName &&
            (unavailable ? (
              <div className="mt-1 text-xs text-ink/45">{item.variantName}</div>
            ) : (
              <VariantPopover
                item={{ productId: item.productId, variantId: item.variantId, quantity: qty }}
                label={item.variantName}
                short={item.variantName.replaceAll(', ', ' · ')}
                pending={edit.switching === item.cartItemId}
                disabled={edit.locked}
                onChange={(variantId) => edit.changeVariant(item, variantId)}
              />
            ))}
          {item.state === 'NOT_ENOUGH_STOCK' && (
            <div className="mt-1.5 text-xs font-medium text-champagne-600">
              Chỉ còn {item.available} sản phẩm
            </div>
          )}
          {/* Giá, số lượng trên màn hẹp */}
          <div className="mt-2.5 flex items-end justify-between gap-2 lg:hidden">
            <span className="text-base font-bold text-navy">{formatMoney(item.price)}</span>
            {stepper}
          </div>
        </div>
      </div>
      <div className="hidden text-center lg:block">
        <div className="text-sm font-medium text-charcoal">{formatMoney(item.price)}</div>
        {hasDiscount && (
          <div className="text-xs text-ink/40 line-through">{formatMoney(item.originalPrice!)}</div>
        )}
      </div>
      <div className="hidden justify-center lg:flex">{stepper}</div>
      <div className="hidden text-center text-[15px] font-bold text-navy lg:block">
        {formatMoney(item.price * qty)}
      </div>
    </div>
  );
}

function ShopBlock({
  shop,
  error,
  onVoucher,
  edit,
}: {
  shop: CheckoutShop;
  error?: string;
  onVoucher: () => void;
  edit: LineEdit;
}) {
  const eligible = shop.vouchers.filter((v) => v.eligible).length;
  const quantity = shop.items.reduce((a, i) => a + i.quantity, 0);
  const viaGhn = shop.shippingFeeSource === 'GHN';
  return (
    <section className={cn(CARD, 'overflow-hidden')}>
      <header
        className={cn('flex items-center border-b border-ink/[0.06] px-4 py-3 lg:px-5', COLS)}
      >
        <Link
          to={`/shop/${shop.shop.id}`}
          className="group flex min-w-0 items-center gap-2.5 text-sm font-semibold text-charcoal"
        >
          <ShopLogo url={shop.shop.logoUrl} className="size-7 rounded-lg ring-1 ring-ink/[0.08]" />
          <span className="truncate transition group-hover:text-navy">{shop.shop.name}</span>
          <IconRosetteDiscountCheckFilled className="size-4 shrink-0 text-navy" />
        </Link>
        <span className="hidden text-center text-[13px] text-ink/55 lg:block">Đơn giá</span>
        <span className="hidden text-center text-[13px] text-ink/55 lg:block">Số lượng</span>
        <span className="hidden text-center text-[13px] text-ink/55 lg:block">Thành tiền</span>
      </header>

      <div className="divide-y divide-ink/[0.06]">
        {shop.items.map((it) => (
          <ItemRow key={it.cartItemId} item={it} edit={edit} />
        ))}
      </div>

      <div className="divide-y divide-ink/[0.06] border-t border-ink/[0.06] text-sm">
        <div className="px-4 py-3 lg:px-5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-charcoal">
              <IconTicket className="size-[1.125rem] text-navy [stroke-width:1.75]" />
              Voucher của shop
            </span>
            {shop.vouchers.length === 0 && !shop.shopVoucher ? (
              <span className="text-ink/45">Shop chưa có mã</span>
            ) : (
              <button
                type="button"
                onClick={onVoucher}
                className="group flex min-w-0 items-center gap-2 font-semibold text-navy transition hover:text-navy-900"
              >
                {shop.shopVoucher ? (
                  <span className="truncate rounded-md border border-dashed border-navy/40 bg-champagne-50 px-2 py-0.5 text-[13px]">
                    {shop.shopVoucher.code} · -{formatMoney(shop.shopVoucher.discount)}
                  </span>
                ) : eligible > 0 ? (
                  `${eligible} mã dùng được`
                ) : (
                  'Xem mã'
                )}
                <IconChevronRight className="-ml-1 size-4 shrink-0 [stroke-width:2] transition group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5">
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-charcoal">
            <IconTruck className="size-[1.125rem] text-ship [stroke-width:1.75]" />
            Vận chuyển
            {viaGhn ? (
              <img src="/partners/ghn.webp" alt="GHN" className="h-5 w-auto" />
            ) : (
              <span className="text-xs text-ink/50">{SHIPPING_SOURCE[shop.shippingFeeSource]}</span>
            )}
          </span>
          <span className="shrink-0 font-medium text-charcoal">
            {formatMoney(shop.shippingFee)}
          </span>
        </div>

        {shop.platformDiscount > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] text-ink/60 lg:px-5">
            <span>Phần voucher sàn tính cho shop này</span>
            <span className="shrink-0 font-medium text-navy">
              -{formatMoney(shop.platformDiscount)}
            </span>
          </div>
        )}

        <div className="flex items-baseline justify-end gap-3 px-4 py-3 lg:px-5">
          <span className="text-ink/60">Tổng ({quantity} sản phẩm)</span>
          <span className="text-lg font-bold text-navy">{formatMoney(shop.total)}</span>
        </div>
      </div>
    </section>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="space-y-4">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-72 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-80 rounded-2xl" />
    </div>
  );
}
