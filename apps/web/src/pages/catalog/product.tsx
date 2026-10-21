import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  House,
  Loader2,
  PackageSearch,
  RotateCcw,
  ShoppingCart,
  Store,
  Ticket,
  Truck,
  X,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ProductDescription } from '@/components/catalog/product-description';
import { ChatWithShopButton } from '@/components/chat/chat-with-shop-button';
import {
  DiscountBadge,
  ProductCard,
  ProductCardSkeleton,
  discountPercent,
  formatSold,
} from '@/components/catalog/product-card';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddToCart } from '@/hooks/use-cart';
import { API, ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toastCartError } from '@/lib/cart-errors';
import type { ProductCardData, ProductDetail, Voucher } from '@/lib/catalog-types';
import { formatDate, formatMoney } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  type Selection,
  findVariant,
  group1Choices,
  group2Choices,
  initialSelection,
  pickGroup1,
} from '@/lib/variants';

/** Còn từ số này trở xuống thì nhãn tồn kho báo "Sắp hết hàng" (chỉ là hiển thị) */
const LOW_STOCK = 5;

/** Trang chi tiết sản phẩm (CAT-04, CAT-03): ảnh, chọn phân loại, giá, thêm vào giỏ, mô tả, hàng liên quan */
export function ProductPage() {
  const { productId = '' } = useParams();
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => api<ProductDetail>(`${API.market}/products/${productId}`),
  });

  if (product.isPending) return <ProductSkeleton />;
  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404) return <NotSelling />;
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <LoadError message={product.error.message} onRetry={() => product.refetch()} />
      </div>
    );
  }
  // key: đổi sang sản phẩm khác thì chọn lại phân loại từ đầu
  return <ProductView key={product.data.id} product={product.data} />;
}

function ProductView({ product }: { product: ProductDetail }) {
  const { variants } = product;
  const hasGroup1 = !!product.option1Name && variants.some((v) => v.option1Value);
  const hasGroup2 = !!product.option2Name && variants.some((v) => v.option2Value);

  const [sel, setSel] = useState<Selection>(() => initialSelection(variants));
  const [qty, setQty] = useState(1);
  const variant = findVariant(variants, sel) ?? variants[0]!;
  const available = variant.available;

  // Ảnh: ảnh chung trước, rồi ảnh theo lựa chọn nhóm 1
  const images = useMemo(() => {
    const general = product.images.filter((i) => !i.option1Value).map((i) => i.url);
    const byOption = product.images.filter((i) => i.option1Value).map((i) => i.url);
    return [...general, ...byOption];
  }, [product.images]);
  const optionImage = (value: string | null) =>
    value ? (product.images.find((i) => i.option1Value === value)?.url ?? null) : null;
  const focusUrl = optionImage(sel.o1);
  const thumb = focusUrl ?? images[0] ?? null;

  const choose = (next: Selection) => {
    setSel(next);
    const v = findVariant(variants, next);
    setQty((q) => Math.min(Math.max(1, q), Math.max(1, v?.available ?? 1)));
  };

  const add = useAddToCartAction(product, thumb);
  const canBuy = available > 0;
  const onAdd = () => add.run(variant.id, Math.min(qty, available));

  const percent = discountPercent(variant.price, variant.originalPrice);
  const category = product.category;

  return (
    <div className="pb-24 lg:pb-0">
      {/* Đường dẫn */}
      <div className="border-b border-ivory-200 bg-ivory">
        <nav
          aria-label="Đường dẫn"
          className="mx-auto flex max-w-7xl items-center gap-1.5 overflow-x-auto whitespace-nowrap px-4 py-3 text-sm text-ink/60 [scrollbar-width:none]"
        >
          <Link to="/" className="flex items-center gap-1.5 transition hover:text-navy">
            <House className="size-4" />
            Trang chủ
          </Link>
          {category.parent && (
            <>
              <ChevronRight className="size-3.5 shrink-0 text-ink/30" />
              <Link to={`/danh-muc/${category.parent.slug}`} className="transition hover:text-navy">
                {category.parent.name}
              </Link>
            </>
          )}
          <ChevronRight className="size-3.5 shrink-0 text-ink/30" />
          <Link to={`/danh-muc/${category.slug}`} className="transition hover:text-navy">
            {category.name}
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-ink/30" />
          <span className="truncate font-medium text-ink">{product.name}</span>
        </nav>
      </div>

      <div className="mx-auto max-w-7xl px-4">
        {/* Phần trên: ảnh + thông tin mua */}
        <section className="grid gap-6 py-5 md:py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <ProductGallery images={images} name={product.name} focusUrl={focusUrl} />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-snug text-navy sm:text-2xl lg:text-[1.75rem]">
              {product.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/60">
              <span>
                Đã bán <b className="font-semibold text-ink">{formatSold(product.soldCount)}</b>
              </span>
              <span className="hidden h-3.5 w-px bg-ink/15 sm:block" />
              <span>
                Danh mục{' '}
                <Link
                  to={`/danh-muc/${category.slug}`}
                  className="font-semibold text-ink hover:text-navy"
                >
                  {category.name}
                </Link>
              </span>
              <span className="hidden h-3.5 w-px bg-ink/15 sm:block" />
              <span>
                Shop{' '}
                <Link
                  to={`/shop/${product.shop.id}`}
                  className="font-semibold text-ink hover:text-navy"
                >
                  {product.shop.name}
                </Link>
              </span>
            </div>
            <div className="mt-4">
              {canBuy && available <= LOW_STOCK ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3.5 py-1.5 text-sm font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  Sắp hết hàng · còn {available}
                </span>
              ) : canBuy ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1.5 text-sm font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                  <span className="size-1.5 rounded-full bg-emerald-500" />
                  Còn hàng
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3.5 py-1.5 text-sm font-medium text-ink/60 ring-1 ring-inset ring-border">
                  <span className="size-1.5 rounded-full bg-ink/40" />
                  Hết hàng
                </span>
              )}
            </div>

            {/* Chọn phân loại */}
            {hasGroup1 && (
              <div className="mt-6">
                <div className="mb-2.5 text-sm text-ink/60">
                  {product.option1Name}: <b className="font-semibold text-ink">{sel.o1}</b>
                </div>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {group1Choices(variants).map((c) => (
                    <OptionBox
                      key={c.value}
                      selected={c.value === sel.o1}
                      disabled={c.disabled}
                      onClick={() => choose(pickGroup1(variants, sel, c.value))}
                      image={optionImage(c.value)}
                    >
                      <span className="block truncate text-sm font-semibold">{c.value}</span>
                      <span className="mt-0.5 block text-xs text-ink/55">
                        {c.disabled ? 'Hết hàng' : c.price !== null ? formatMoney(c.price) : ''}
                      </span>
                    </OptionBox>
                  ))}
                </div>
              </div>
            )}
            {hasGroup2 && (
              <div className="mt-4 sm:flex sm:items-start sm:gap-4">
                <div className="mb-2.5 shrink-0 text-sm font-semibold text-ink sm:mb-0 sm:w-24 sm:pt-2.5">
                  {product.option2Name}
                </div>
                <div className="flex flex-wrap gap-2.5">
                  {group2Choices(variants, sel).map((c) => (
                    <OptionBox
                      key={c.value}
                      compact
                      selected={c.value === sel.o2}
                      disabled={c.disabled}
                      onClick={() => choose({ o1: sel.o1, o2: c.value })}
                    >
                      <span className="text-sm font-semibold">{c.value}</span>
                    </OptionBox>
                  ))}
                </div>
              </div>
            )}

            <PriceBox
              price={variant.price}
              originalPrice={variant.originalPrice}
              percent={percent}
              shopId={product.shop.id}
            />

            {/* Số lượng + thêm vào giỏ */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm font-semibold text-ink">Số lượng</span>
              <QuantityStepper value={qty} max={available} onChange={setQty} disabled={!canBuy} />
              <span className="text-sm text-ink/55">
                {canBuy ? `${available.toLocaleString('vi-VN')} sản phẩm có sẵn` : 'Tạm hết hàng'}
              </span>
            </div>
            <Button
              size="lg"
              className="mt-5 hidden h-13 w-full rounded-xl text-base font-semibold shadow-[0_10px_24px_-12px_rgba(23,37,84,0.6)] lg:flex"
              disabled={!canBuy || add.pending}
              onClick={onAdd}
            >
              {add.pending ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <ShoppingCart className="size-5" />
              )}
              {canBuy ? 'Thêm vào giỏ hàng' : 'Phân loại này đã hết hàng'}
            </Button>
            <ChatWithShopButton
              shopId={product.shop.id}
              productId={product.id}
              className="mt-3 h-11 w-full rounded-xl"
            />
          </div>
        </section>

        <ShopBox shop={product.shop} />

        {/* Mô tả + thông số */}
        <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-3xl border border-ivory-200 bg-card p-5 sm:p-8">
            <SectionTitle>Mô tả sản phẩm</SectionTitle>
            <div className="mt-5">
              <ProductDescription text={product.description} />
            </div>
          </div>
          <div className="lg:sticky lg:top-28 lg:self-start">
            <SpecTable product={product} />
          </div>
        </section>

        <ProductRow
          title="Sản phẩm liên quan"
          query={{ categoryId: category.id }}
          excludeId={product.id}
          moreLink={`/danh-muc/${category.slug}`}
        />
        <ProductRow
          title={`Sản phẩm khác của ${product.shop.name}`}
          query={{ shopId: product.shop.id }}
          excludeId={product.id}
          moreLink={`/shop/${product.shop.id}`}
        />
        <div className="h-12" />
      </div>

      {/* Thanh mua cố định dưới màn hình điện thoại */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ivory-200 bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(23,37,84,0.25)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold leading-6 text-navy">
              {formatMoney(variant.price)}
            </div>
            {percent > 0 && (
              <div className="text-xs text-ink/45 line-through">
                {formatMoney(variant.originalPrice!)}
              </div>
            )}
          </div>
          <Button
            size="lg"
            className="h-12 rounded-xl px-5 text-[15px] font-semibold"
            disabled={!canBuy || add.pending}
            onClick={onAdd}
          >
            {add.pending ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ShoppingCart className="size-5" />
            )}
            {canBuy ? 'Thêm vào giỏ' : 'Hết hàng'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Thêm vào giỏ: khách chưa đăng nhập thì sang trang đăng nhập rồi quay lại trang này */
function useAddToCartAction(product: ProductDetail, thumb: string | null) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useAddToCart();

  const run = (variantId: string, quantity: number) => {
    if (session.status === 'loading') return;
    if (session.status === 'guest') {
      const returnTo = location.pathname + location.search;
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    mutation.mutate(
      { variantId, quantity },
      {
        onSuccess: () =>
          toast.custom((id) => (
            <AddedToast
              image={thumb}
              name={product.name}
              onView={() => {
                toast.dismiss(id);
                navigate('/gio-hang');
              }}
              onClose={() => toast.dismiss(id)}
            />
          )),
        onError: toastCartError,
      },
    );
  };
  return { run, pending: mutation.isPending };
}

function AddedToast({
  image,
  name,
  onView,
  onClose,
}: {
  image: string | null;
  name: string;
  onView: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex w-[22rem] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-ivory-200 bg-card p-3 font-sans shadow-[0_16px_40px_-16px_rgba(23,37,84,0.35)]">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1">
        {image ? (
          <img src={image} alt="" className="size-full object-contain" />
        ) : (
          <ShoppingCart className="size-5 text-champagne-600" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
          <Check className="size-4" />
          Đã thêm vào giỏ hàng
        </div>
        <div className="mt-0.5 truncate text-xs text-ink/60">{name}</div>
        <button
          type="button"
          onClick={onView}
          className="mt-1 text-xs font-semibold text-navy underline-offset-2 hover:underline"
        >
          Xem giỏ hàng →
        </button>
      </div>
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="self-start rounded-md p-1 text-ink/40 hover:bg-ivory hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** Ô chọn một lựa chọn: đang chọn có viền navy và góc tick champagne; hết hàng thì mờ và gạch */
function OptionBox({
  selected,
  disabled,
  compact,
  image,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  compact?: boolean;
  image?: string | null;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'relative flex min-w-0 items-center gap-2.5 overflow-hidden rounded-xl border bg-card text-left transition',
        compact ? 'min-w-[5.5rem] justify-center px-5 py-2.5' : 'py-2.5 pl-3 pr-5',
        selected
          ? 'border-navy text-navy ring-1 ring-navy'
          : 'border-ivory-200 text-ink hover:border-champagne',
        disabled &&
          'cursor-not-allowed border-dashed bg-ivory text-ink/35 line-through hover:border-ivory-200',
      )}
    >
      {image && (
        <img
          src={image}
          alt=""
          className={cn('size-9 shrink-0 object-contain', disabled && 'opacity-40')}
        />
      )}
      <span className="min-w-0">{children}</span>
      {selected && (
        <span className="absolute right-0 top-0 flex size-4 items-center justify-center rounded-bl-md bg-navy text-champagne">
          <Check className="size-2.5" strokeWidth={3.5} />
        </span>
      )}
    </button>
  );
}

const PROMISES = [
  { icon: Truck, text: 'Giao hàng qua GHN, theo dõi vận đơn rõ ràng' },
  { icon: CreditCard, text: 'Thanh toán VNPay hoặc trả tiền khi nhận hàng (COD)' },
  { icon: RotateCcw, text: 'Trả hàng, hoàn tiền theo chính sách của sàn' },
  { icon: BadgeCheck, text: 'Shop đã qua kiểm duyệt hồ sơ trước khi bán' },
];

/** Hộp giá: giá đang bán, giá gốc gạch ngang, nhãn -%, voucher của shop và cam kết của sàn */
function PriceBox({
  price,
  originalPrice,
  percent,
  shopId,
}: {
  price: number;
  originalPrice: number | null;
  percent: number;
  shopId: string;
}) {
  const vouchers = useQuery({
    queryKey: ['shop-vouchers', shopId],
    queryFn: () => api<Voucher[]>(`${API.market}/shops/${shopId}/vouchers`),
    staleTime: 60_000,
  });

  return (
    <div className="mt-6 rounded-3xl border border-champagne/40 bg-gradient-to-br from-champagne-50 via-champagne-50/60 to-card p-4 sm:p-6">
      <div className="text-sm text-ink/60">Giá bán</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-3xl font-bold tracking-tight text-navy sm:text-[2.25rem]">
          {formatMoney(price)}
        </span>
        {percent > 0 && (
          <>
            <span className="text-lg text-ink/40 line-through">{formatMoney(originalPrice!)}</span>
            <DiscountBadge percent={percent} className="rounded-lg text-sm" />
          </>
        )}
      </div>

      {vouchers.data && vouchers.data.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <Ticket className="size-4 text-champagne-600" />
            Mã giảm giá của shop
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {vouchers.data.slice(0, 4).map((v) => (
              <VoucherTicket key={v.id} voucher={v} />
            ))}
          </div>
          <p className="mt-2 text-xs text-ink/50">Mã được nhập khi đặt hàng.</p>
        </div>
      )}

      <ul className="mt-5 grid gap-2.5 border-t border-champagne/30 pt-4 sm:grid-cols-2">
        {PROMISES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2.5 text-[13px] leading-5 text-ink/75">
            <Icon className="mt-0.5 size-4 shrink-0 text-champagne-600" />
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 500000 → "500k", 15000000 → "15tr", 1500000 → "1,5tr" */
function shortMoney(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000) return `${(n / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k`;
  return formatMoney(n);
}

function voucherTitle(v: Voucher): string {
  if (v.discountType === 'AMOUNT') return `Giảm ${shortMoney(v.value)}`;
  return v.maxDiscount
    ? `Giảm ${v.value}% tối đa ${shortMoney(v.maxDiscount)}`
    : `Giảm ${v.value}%`;
}

function VoucherTicket({ voucher }: { voucher: Voucher }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(voucher.code);
      toast.success(`Đã sao chép mã ${voucher.code}`);
    } catch {
      toast.error('Trình duyệt không cho sao chép, bạn ghi lại mã giúp mình nhé.');
    }
  };
  return (
    <div className="relative flex items-stretch overflow-hidden rounded-xl border border-champagne/50 bg-card">
      <div className="flex w-16 shrink-0 flex-col items-center justify-center border-r border-dashed border-champagne/60 bg-navy px-1.5 text-center text-champagne sm:w-20 sm:px-2">
        <Ticket className="size-4" />
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide">Voucher</span>
      </div>
      <div className="min-w-0 flex-1 px-3 py-2">
        <div className="text-sm font-semibold leading-snug text-navy">{voucherTitle(voucher)}</div>
        <div className="mt-0.5 text-xs leading-snug text-ink/55">
          {voucher.minOrder > 0 ? `Đơn từ ${shortMoney(voucher.minOrder)}` : 'Mọi đơn'} · HSD{' '}
          {formatDate(voucher.endAt)}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="flex shrink-0 flex-col items-center justify-center gap-0.5 px-2.5 text-[11px] sm:px-3 font-medium text-ink/60 transition hover:bg-champagne-50 hover:text-navy"
        title="Sao chép mã"
      >
        <span className="font-mono text-xs font-bold tracking-wider text-navy">{voucher.code}</span>
        <span className="flex items-center gap-1">
          <Copy className="size-3" /> Sao chép mã
        </span>
      </button>
    </div>
  );
}

function ShopBox({ shop }: { shop: ProductDetail['shop'] }) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-ivory-200 bg-card p-4 sm:flex-row sm:items-center sm:p-6">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <ShopLogo url={shop.logoUrl} className="size-16 border border-ivory-200 sm:size-20" />
        <div className="min-w-0">
          <div className="truncate text-lg font-bold text-navy">{shop.name}</div>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink/60">
            <span className="flex items-center gap-1.5">
              <Store className="size-4 text-champagne-600" />
              <b className="font-semibold text-ink">{shop.productCount}</b> sản phẩm
            </span>
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4 text-champagne-600" />
              Tham gia {formatDate(shop.joinedAt)}
            </span>
          </div>
        </div>
      </div>
      <Button asChild variant="outline" className="h-11 rounded-xl border-navy px-6 text-navy">
        <Link to={`/shop/${shop.id}`}>
          <Store className="size-4" />
          Xem shop
        </Link>
      </Button>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-lg font-bold text-navy sm:text-xl">
      <span className="h-6 w-1 rounded-full bg-champagne" />
      {children}
    </h2>
  );
}

function formatWeight(g: number): string {
  return g >= 1000
    ? `${(g / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`
    : `${g} g`;
}

function SpecTable({ product }: { product: ProductDetail }) {
  const values = (group: 1 | 2) => [
    ...new Set(
      product.variants
        .map((v) => (group === 1 ? v.option1Value : v.option2Value))
        .filter((x): x is string => !!x),
    ),
  ];
  const rows: Array<[string, React.ReactNode]> = [
    [
      'Danh mục',
      <Link key="c" to={`/danh-muc/${product.category.slug}`} className="text-navy hover:underline">
        {product.category.parent ? `${product.category.parent.name} › ` : ''}
        {product.category.name}
      </Link>,
    ],
    ['Khối lượng', formatWeight(product.weight)],
  ];
  if (product.option1Name && values(1).length)
    rows.push([product.option1Name, values(1).join(', ')]);
  if (product.option2Name && values(2).length)
    rows.push([product.option2Name, values(2).join(', ')]);
  rows.push(['Cửa hàng', product.shop.name]);

  return (
    <div className="rounded-3xl border border-ivory-200 bg-card p-5 sm:p-6">
      <SectionTitle>Thông số</SectionTitle>
      <dl className="mt-4 divide-y divide-ivory-200 overflow-hidden rounded-2xl border border-ivory-200 text-sm">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              'grid grid-cols-[7.5rem_1fr] gap-3 px-4 py-3',
              i % 2 === 0 && 'bg-ivory/70',
            )}
          >
            <dt className="text-ink/55">{k}</dt>
            <dd className="font-medium text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Một hàng sản phẩm cuộn ngang (hàng liên quan, hàng khác của shop); không có gì thì ẩn hẳn */
function ProductRow({
  title,
  query,
  excludeId,
  moreLink,
}: {
  title: string;
  query: { categoryId?: string; shopId?: string };
  excludeId: string;
  moreLink: string;
}) {
  const params = { ...query, pageSize: 11, sort: 'best_selling' };
  const list = useQuery({
    queryKey: ['products', params],
    queryFn: () => api<Page<ProductCardData>>(`${API.market}/products`, { query: params }),
    staleTime: 60_000,
  });
  const items = (list.data?.items ?? []).filter((p) => p.id !== excludeId).slice(0, 10);
  const trackRef = useRef<HTMLDivElement>(null);
  if (list.isError || (list.isSuccess && items.length === 0)) return null;

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (track) track.scrollBy({ left: dir * track.clientWidth * 0.8, behavior: 'smooth' });
  };
  const cell = 'w-[46%] shrink-0 snap-start sm:w-[calc((100%-2rem)/3)] lg:w-[calc((100%-4rem)/5)]';

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <SectionTitle>{title}</SectionTitle>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={moreLink}
            className="flex items-center gap-1 text-sm font-medium text-champagne-600 hover:text-navy"
          >
            Xem tất cả <ChevronRight className="size-4" />
          </Link>
          {items.length > 5 && (
            <span className="ml-2 hidden gap-2 lg:flex">
              {([-1, 1] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={dir < 0 ? 'Xem trước' : 'Xem tiếp'}
                  onClick={() => scrollBy(dir)}
                  className="flex size-9 items-center justify-center rounded-full border border-champagne/60 bg-card text-champagne-600 transition hover:bg-navy hover:text-champagne"
                >
                  {dir < 0 ? (
                    <ChevronLeft className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </button>
              ))}
            </span>
          )}
        </div>
      </div>
      <div
        ref={trackRef}
        className="-mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
      >
        {list.isPending
          ? Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={cell}>
                <ProductCardSkeleton />
              </div>
            ))
          : items.map((p) => (
              <div key={p.id} className={cell}>
                <ProductCard product={p} className="h-full" />
              </div>
            ))}
      </div>
    </section>
  );
}

/** Sản phẩm bị ẩn, shop bị đình chỉ hoặc không có: 404 */
function NotSelling() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div className="mx-auto flex max-w-lg flex-col items-center rounded-3xl border border-ivory-200 bg-card px-6 py-14 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-champagne-50 text-champagne-600 ring-8 ring-champagne-50/50">
          <PackageSearch className="size-7" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-navy">Sản phẩm không còn bán</h1>
        <p className="mt-2 text-sm text-ink/60">
          Sản phẩm này đã ngừng bán, tạm ẩn hoặc đường dẫn không đúng. Bạn xem các sản phẩm khác
          trên sàn nhé.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild className="h-11 rounded-xl px-6">
            <Link to="/">
              <House className="size-4" />
              Về trang chủ
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 rounded-xl px-6">
            <Link to="/tim-kiem">Tìm sản phẩm khác</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div>
      <div className="border-b border-ivory-200 bg-ivory">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
      </div>
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-5 md:py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          <Skeleton className="aspect-square w-full rounded-3xl" />
          <div className="mt-4 hidden gap-3 md:flex">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="size-20 rounded-2xl" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-4 h-8 w-28 rounded-full" />
          <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="mt-6 h-56 w-full rounded-3xl" />
          <Skeleton className="mt-6 h-12 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
