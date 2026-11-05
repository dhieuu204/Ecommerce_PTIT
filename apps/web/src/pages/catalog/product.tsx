import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconHome,
  IconLoader2,
  IconMapPin,
  IconPackageOff,
  IconRosetteDiscountCheck,
  IconRosetteDiscountCheckFilled,
  IconShoppingCartPlus,
  IconStarFilled,
  IconX,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ProductDescription } from '@/components/catalog/product-description';
import { ChatWithShopButton } from '@/components/chat/chat-with-shop-button';
import {
  ProductCard,
  ProductCardSkeleton,
  discountPercent,
  formatSold,
} from '@/components/catalog/product-card';
import { ProductGallery } from '@/components/catalog/product-gallery';
import { QuantityStepper } from '@/components/catalog/quantity-stepper';
import { dayMonth, shortValue } from '@/components/catalog/voucher-ticket';
import { SectionTitle } from '@/components/home/home-sections';
import { FollowButton } from '@/components/home/home-shops';
import { ProductEngagementBar } from '@/components/reviews/engagement';
import { ReviewsSection } from '@/components/reviews/review-list';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { ReportButton } from '@/components/moderation/report-button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddToCart } from '@/hooks/use-cart';
import { API, ApiError, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toastCartError } from '@/lib/cart-errors';
import type { ProductCardData, ProductDetail, PublicShop, Voucher } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
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

/** Bóng nhẹ chung của các thẻ trắng trên trang (giống trang chủ) */
const CARD = 'rounded-3xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)]';

/** Trang chi tiết sản phẩm (CAT-04, CAT-03): ảnh, chọn phân loại, giá, mua, shop, mô tả, thông số, đánh giá */
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

/**
 * Bố cục theo trang chủ (tham khảo trang sản phẩm CellphoneS, Thế Giới Di Động, apple.com): thẻ trắng lớn
 * gồm bộ ảnh + cam kết bên trái và khối mua bên phải (tên, đánh giá, khối giá, phân loại có giá, voucher, số
 * lượng, Mua ngay / Thêm vào giỏ); thẻ shop; mô tả + đánh giá bên trái, thông số kỹ thuật bám theo bên phải;
 * hàng sản phẩm liên quan. Điện thoại có thanh mua cố định ở đáy màn hình.
 */
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

  const cart = useCartActions(product, thumb);
  const canBuy = available > 0;
  const quantity = Math.min(qty, available);
  const percent = discountPercent(variant.price, variant.originalPrice);
  const category = product.category;

  return (
    <div className="pb-24 lg:pb-0">
      <div className="mx-auto max-w-7xl px-4">
        <Breadcrumb product={product} />

        {/* Ảnh + khối mua */}
        <section
          className={cn(
            CARD,
            'grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:p-8',
          )}
        >
          <div className="lg:sticky lg:top-20 lg:self-start">
            <ProductGallery
              images={images}
              name={product.name}
              focusUrl={focusUrl}
              overlay={
                <div className="pointer-events-none absolute top-3 left-3 flex flex-wrap gap-2">
                  {percent > 0 && (
                    <span className="rounded-lg bg-navy px-2.5 py-1 text-xs font-bold text-white">
                      -{percent}%
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-lg bg-card/90 px-2.5 py-1 text-xs font-semibold text-charcoal shadow-sm">
                    <IconRosetteDiscountCheckFilled className="size-4 text-navy" />
                    Chính hãng
                  </span>
                </div>
              }
            />
          </div>

          <div className="min-w-0">
            <h1 className="text-xl leading-snug font-bold tracking-tight text-charcoal sm:text-2xl lg:text-[1.625rem]">
              {product.name}
            </h1>
            <ProductEngagementBar
              product={product}
              extra={
                <>
                  <span aria-hidden className="h-3.5 w-px bg-ink/15" />
                  <span className="text-sm text-ink/60">
                    Đã bán{' '}
                    <b className="font-semibold text-charcoal">{formatSold(product.soldCount)}</b>
                  </span>
                </>
              }
            />

            <PriceBox
              price={variant.price}
              originalPrice={variant.originalPrice}
              percent={percent}
              available={available}
            />

            {/* Phân loại nhóm 1 (thường là màu): ô có ảnh, tên, giá thấp nhất */}
            {hasGroup1 && (
              <div className="mt-6">
                <p className="text-sm font-medium text-charcoal">
                  {product.option1Name}: <span className="font-normal text-ink/60">{sel.o1}</span>
                </p>
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {group1Choices(variants).map((c) => {
                    // Giá theo nhóm 2 đang chọn (ví dụ màu này bản 512GB); màu không có bản đó thì giá thấp nhất
                    const same = hasGroup2
                      ? findVariant(variants, { o1: c.value, o2: sel.o2 })
                      : null;
                    const price = same?.price ?? c.price;
                    return (
                      <OptionBox
                        key={c.value}
                        selected={c.value === sel.o1}
                        disabled={c.disabled}
                        onClick={() => choose(pickGroup1(variants, sel, c.value))}
                        image={optionImage(c.value)}
                      >
                        <span className="block truncate text-[13px] font-semibold">{c.value}</span>
                        <span className="mt-0.5 block text-xs text-ink/55">
                          {c.disabled ? 'Hết hàng' : price !== null ? formatMoney(price) : ''}
                        </span>
                      </OptionBox>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phân loại nhóm 2 (thường là dung lượng): thẻ ghi giá của bản đó theo nhóm 1 đang chọn */}
            {hasGroup2 && (
              <div className="mt-5">
                <p className="text-sm font-medium text-charcoal">{product.option2Name}</p>
                <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {group2Choices(variants, sel).map((c) => {
                    const v = findVariant(variants, { o1: sel.o1, o2: c.value });
                    return (
                      <OptionBox
                        key={c.value}
                        centered
                        selected={c.value === sel.o2}
                        disabled={c.disabled}
                        onClick={() => choose({ o1: sel.o1, o2: c.value })}
                      >
                        <span className="block text-sm font-bold">{c.value}</span>
                        <span className="mt-0.5 block text-xs text-ink/55">
                          {c.disabled ? 'Hết hàng' : v ? formatMoney(v.price) : ''}
                        </span>
                      </OptionBox>
                    );
                  })}
                </div>
              </div>
            )}

            <ShopVouchers shopId={product.shop.id} />

            {/* Số lượng */}
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-sm font-medium text-charcoal">Số lượng</span>
              <QuantityStepper value={qty} max={available} onChange={setQty} disabled={!canBuy} />
              <span className="text-sm text-ink/55">
                {canBuy ? `${available.toLocaleString('vi-VN')} sản phẩm có sẵn` : 'Tạm hết hàng'}
              </span>
            </div>

            {/* Nút mua */}
            <div className="mt-5 hidden gap-2.5 lg:flex">
              <button
                type="button"
                disabled={!canBuy || cart.pending}
                onClick={() => cart.buyNow(variant.id, quantity)}
                className="flex h-14 flex-1 flex-col items-center justify-center rounded-lg bg-gradient-to-r from-header-from to-header-to text-white shadow-[0_12px_24px_-12px_rgba(238,77,45,0.7)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base leading-tight font-bold">
                  {canBuy ? 'Mua ngay' : 'Phân loại này đã hết hàng'}
                </span>
                {canBuy && (
                  <span className="text-xs leading-tight opacity-90">
                    Giao tận nơi hoặc nhận hàng rồi trả tiền
                  </span>
                )}
              </button>
              <button
                type="button"
                disabled={!canBuy || cart.pending}
                onClick={() => cart.add(variant.id, quantity)}
                className="flex h-14 w-28 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-navy text-navy transition hover:bg-champagne-50 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cart.pending ? (
                  <IconLoader2 className="size-5 animate-spin" />
                ) : (
                  <IconShoppingCartPlus className="size-5 [stroke-width:1.75]" />
                )}
                <span className="text-xs font-semibold">Thêm vào giỏ</span>
              </button>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <ChatWithShopButton
                shopId={product.shop.id}
                productId={product.id}
                className="h-11 flex-1 rounded-lg border-ink/15 bg-card text-charcoal hover:border-navy/40 hover:bg-card hover:text-navy"
              />
              <ReportButton targetType="PRODUCT" targetId={product.id} shopId={product.shop.id} />
            </div>
          </div>
        </section>

        <ShopCard shopId={product.shop.id} fallback={product.shop} productId={product.id} />

        {/* Mô tả + đánh giá | thông số */}
        <section className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-5">
            <div className={cn(CARD, 'p-5 sm:p-7')}>
              <CardTitle>Mô tả sản phẩm</CardTitle>
              <div className="mt-4">
                <ProductDescription text={withoutSpecs(product.description)} />
              </div>
            </div>
            <ReviewsSection source="product" id={product.id} />
          </div>
          <div className="lg:sticky lg:top-20 lg:self-start">
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
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-black/[0.06] bg-card/95 px-4 py-3 shadow-[0_-8px_24px_-12px_rgba(15,26,61,0.25)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg leading-6 font-bold text-navy">
              {formatMoney(variant.price)}
            </div>
            {percent > 0 && (
              <div className="text-xs text-ink/45 line-through">
                {formatMoney(variant.originalPrice!)}
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Thêm vào giỏ"
            disabled={!canBuy || cart.pending}
            onClick={() => cart.add(variant.id, quantity)}
            className="flex size-12 items-center justify-center rounded-lg border border-navy text-navy disabled:opacity-50"
          >
            <IconShoppingCartPlus className="size-5 [stroke-width:1.75]" />
          </button>
          <button
            type="button"
            disabled={!canBuy || cart.pending}
            onClick={() => cart.buyNow(variant.id, quantity)}
            className="h-12 rounded-lg bg-gradient-to-r from-header-from to-header-to px-6 text-[15px] font-bold text-white disabled:opacity-50"
          >
            {canBuy ? 'Mua ngay' : 'Hết hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Đường dẫn: Trang chủ › danh mục cha › danh mục › tên sản phẩm */
function Breadcrumb({ product }: { product: ProductDetail }) {
  const { category } = product;
  const sep = <IconChevronRight className="size-3.5 shrink-0 text-ink/30" />;
  return (
    <nav
      aria-label="Đường dẫn"
      className="flex items-center gap-1.5 overflow-x-auto py-3.5 text-[13px] whitespace-nowrap text-ink/55 [scrollbar-width:none]"
    >
      <Link to="/" className="flex items-center gap-1 transition hover:text-navy">
        <IconHome className="size-4 [stroke-width:1.75]" />
        Trang chủ
      </Link>
      {category.parent && (
        <>
          {sep}
          <Link to={`/danh-muc/${category.parent.slug}`} className="transition hover:text-navy">
            {category.parent.name}
          </Link>
        </>
      )}
      {sep}
      <Link to={`/danh-muc/${category.slug}`} className="transition hover:text-navy">
        {category.name}
      </Link>
      {sep}
      <span className="truncate font-medium text-charcoal">{product.name}</span>
    </nav>
  );
}

/** Tiêu đề trong thẻ: gạch cam ngắn + chữ đậm (như tiêu đề khu ở trang chủ) */
function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-charcoal md:text-lg">
      <span aria-hidden className="h-[3px] w-5 shrink-0 rounded-full bg-navy" />
      {children}
    </h2>
  );
}

/** Khối giá: giá đang bán, giá gốc, nhãn -%, số tiền tiết kiệm, tình trạng hàng của phân loại đang chọn */
function PriceBox({
  price,
  originalPrice,
  percent,
  available,
}: {
  price: number;
  originalPrice: number | null;
  percent: number;
  available: number;
}) {
  return (
    <div className="mt-5 rounded-2xl bg-gradient-to-r from-champagne-50 to-card px-5 py-4 ring-1 ring-navy/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
          <span
            key={price}
            className="text-[1.75rem] leading-none font-bold tracking-tight text-navy animate-in fade-in-0 slide-in-from-bottom-1 duration-300 sm:text-[2rem]"
          >
            {formatMoney(price)}
          </span>
          {percent > 0 && (
            <>
              <span className="text-base text-ink/40 line-through">
                {formatMoney(originalPrice!)}
              </span>
              <span className="rounded-md bg-navy px-1.5 py-0.5 text-xs font-bold text-white">
                -{percent}%
              </span>
            </>
          )}
        </div>
        <StockBadge available={available} />
      </div>
      {percent > 0 && (
        <p className="mt-2 text-xs text-ink/60">
          Tiết kiệm <b className="font-semibold text-navy">{formatMoney(originalPrice! - price)}</b>{' '}
          so với giá gốc
        </p>
      )}
    </div>
  );
}

function StockBadge({ available }: { available: number }) {
  if (available <= 0) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink/[0.06] px-2.5 py-1 text-xs font-semibold text-ink/55">
        <span className="size-1.5 rounded-full bg-ink/40" />
        Hết hàng
      </span>
    );
  }
  const low = available <= LOW_STOCK;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold',
        low ? 'bg-champagne-50 text-champagne-600' : 'bg-emerald-50 text-emerald-700',
      )}
    >
      <span className={cn('size-1.5 rounded-full', low ? 'bg-champagne' : 'bg-emerald-500')} />
      {low ? `Sắp hết · còn ${available}` : 'Còn hàng'}
    </span>
  );
}

/** Ô chọn phân loại: đang chọn viền cam nền cam nhạt có dấu tick góc; hết hàng thì mờ */
function OptionBox({
  selected,
  disabled,
  centered,
  image,
  onClick,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  centered?: boolean;
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
        'relative flex min-w-0 items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none',
        centered && 'flex-col justify-center gap-0 text-center',
        selected
          ? 'border-navy bg-champagne-50 text-navy'
          : 'border-ink/15 bg-card text-charcoal hover:border-navy/50',
        disabled && 'cursor-not-allowed opacity-45 hover:border-ink/15',
      )}
    >
      {image && (
        <img
          src={image}
          alt=""
          className="size-10 shrink-0 rounded-md object-contain mix-blend-multiply"
        />
      )}
      <span className="min-w-0">{children}</span>
      {selected && (
        <span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-tr-[7px] rounded-bl-md bg-navy text-white">
          <IconCheck className="size-3 [stroke-width:3]" />
        </span>
      )}
    </button>
  );
}

/** Mã giảm giá của shop: vé nhỏ cuống cam (cùng kiểu vé ở trang chủ), bấm "Lưu" để sao chép mã */
function ShopVouchers({ shopId }: { shopId: string }) {
  const vouchers = useQuery({
    queryKey: ['shop-vouchers', shopId],
    queryFn: () => api<Voucher[]>(`${API.market}/shops/${shopId}/vouchers`),
    staleTime: 60_000,
  });
  const list = vouchers.data ?? [];
  if (list.length === 0) return null;
  return (
    <div className="mt-6">
      <p className="text-sm font-medium text-charcoal">Mã giảm giá của shop</p>
      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        {list.slice(0, 4).map((v) => (
          <VoucherMini key={v.id} voucher={v} />
        ))}
      </div>
    </div>
  );
}

function VoucherMini({ voucher: v }: { voucher: Voucher }) {
  const [saved, setSaved] = useState(false);
  const save = async () => {
    try {
      await navigator.clipboard.writeText(v.code);
      setSaved(true);
      toast.success(`Đã lưu mã ${v.code}`, { description: 'Dùng khi thanh toán đơn của shop.' });
    } catch {
      toast.error(`Không lưu được. Mã voucher là ${v.code}.`);
    }
  };
  const short = compactMoney;
  return (
    <div className="relative flex h-16 rounded-lg border border-ink/10 bg-card">
      <div className="relative flex w-16 shrink-0 flex-col items-center justify-center rounded-l-lg bg-gradient-to-br from-header-from to-header-to text-white">
        <span className="text-[9px] font-semibold tracking-[0.14em] uppercase opacity-90">
          Giảm
        </span>
        <span className="text-base leading-tight font-bold">{shortValue(v)}</span>
        <span aria-hidden className="absolute inset-y-2 -left-[3px] flex flex-col justify-between">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="size-1.5 rounded-full bg-card" />
          ))}
        </span>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2 pr-2 pl-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold text-charcoal">
            {v.minOrder > 0 ? `Đơn từ ${short(v.minOrder)}` : 'Mọi đơn hàng'}
            {v.discountType === 'PERCENT' && v.maxDiscount
              ? `, tối đa ${short(v.maxDiscount)}`
              : ''}
          </div>
          <div className="mt-0.5 text-[11px] text-ink/45">HSD {dayMonth(v.endAt)}</div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          aria-label={saved ? `Đã lưu mã ${v.code}` : `Lưu mã ${v.code}`}
          className={cn(
            'inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none',
            saved ? 'text-ink/45' : 'bg-navy text-white hover:bg-navy-900',
          )}
        >
          {saved && <IconCheck className="size-3.5 [stroke-width:2.25]" />}
          {saved ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}

/** Số tiền gọn cho dòng điều kiện voucher: 300000 → "300k", 15000000 → "15tr" */
function compactMoney(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return formatMoney(n);
}

/** Thời gian đã tham gia sàn: "8 tháng", "2 năm", "Mới tham gia" */
function joinedFor(joinedAt: string): string {
  const months = Math.floor((Date.now() - new Date(joinedAt).getTime()) / (30.44 * 86_400_000));
  if (months < 1) return 'Mới tham gia';
  if (months < 12) return `${months} tháng`;
  return `${Math.floor(months / 12)} năm`;
}

/**
 * Thẻ shop (cùng kiểu thẻ shop trang chủ): logo, tên + tick, nơi bán, số liệu (đánh giá, sản phẩm, người
 * theo dõi, tham gia), nút Theo dõi, Chat, Xem shop. Số liệu lấy từ GET /shops/{id} (chung cache trang chủ).
 */
function ShopCard({
  shopId,
  fallback,
  productId,
}: {
  shopId: string;
  fallback: ProductDetail['shop'];
  productId: string;
}) {
  const q = useQuery({
    queryKey: ['shop', shopId],
    queryFn: () => api<PublicShop>(`${API.market}/shops/${shopId}`),
    staleTime: 60_000,
  });
  const shop = q.data;
  const rated = !!shop && shop.ratingAvg !== null && shop.ratingCount > 0;
  const stats: Array<{ value: React.ReactNode; label: string }> = [
    {
      value: rated ? (
        <>
          <IconStarFilled className="size-3.5 text-champagne" />
          {shop!.ratingAvg!.toFixed(1)}
        </>
      ) : (
        '—'
      ),
      label: rated ? `${formatSold(shop!.ratingCount)} đánh giá` : 'Chưa có đánh giá',
    },
    { value: formatSold(shop?.productCount ?? fallback.productCount), label: 'Sản phẩm' },
    { value: shop ? formatSold(shop.followerCount) : '—', label: 'Người theo dõi' },
    { value: joinedFor(shop?.joinedAt ?? fallback.joinedAt), label: 'Tham gia' },
  ];

  return (
    <section
      className={cn(
        CARD,
        'mt-5 flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:gap-8',
      )}
    >
      <div className="flex min-w-0 items-center gap-4 lg:w-[29rem] lg:shrink-0">
        <ShopLogo
          url={fallback.logoUrl}
          className="size-16 rounded-2xl ring-1 ring-ink/[0.08] sm:size-[4.5rem]"
        />
        <div className="min-w-0">
          <Link
            to={`/shop/${shopId}`}
            className="flex items-center gap-1.5 text-base font-bold text-charcoal transition hover:text-navy"
          >
            <span className="truncate">{fallback.name}</span>
            <IconRosetteDiscountCheckFilled className="size-[1.125rem] shrink-0 text-navy" />
          </Link>
          <div className="mt-1 flex items-center gap-3 text-xs text-ink/55">
            <span className="inline-flex items-center gap-1">
              <IconRosetteDiscountCheck className="size-3.5" />
              Shop đã kiểm duyệt
            </span>
            {shop?.provinceName && (
              <span className="inline-flex items-center gap-1">
                <IconMapPin className="size-3.5" />
                {shop.provinceName}
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {shop && <FollowButton shop={shop} />}
            <ChatWithShopButton
              shopId={shopId}
              productId={productId}
              className="h-9 rounded-lg border-ink/15 bg-card px-3.5 text-[13px] text-charcoal hover:border-navy/40 hover:bg-card hover:text-navy"
            />
            <Link
              to={`/shop/${shopId}`}
              className="inline-flex h-9 items-center rounded-lg border border-navy px-3.5 text-[13px] font-semibold text-navy transition hover:bg-champagne-50 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none"
            >
              Xem shop
            </Link>
          </div>
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 gap-y-4 rounded-2xl bg-page py-4 sm:grid-cols-4 sm:divide-x sm:divide-ink/[0.07]">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0 px-3 text-center">
            <div className="flex items-center justify-center gap-1 truncate text-lg font-bold text-charcoal">
              {s.value}
            </div>
            <div className="mt-0.5 truncate text-xs text-ink/50">{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * Mô tả bỏ khúc "Thông số nổi bật" (dòng tiêu đề và các dòng "- Nhãn: giá trị" ngay sau) vì đã hiện trong bảng
 * thông số kỹ thuật bên phải.
 */
function withoutSpecs(description: string): string {
  const lines = description.replace(/\r\n/g, '\n').split('\n');
  const at = lines.findIndex((l) => l.trim() === 'Thông số nổi bật');
  if (at < 0) return description;
  let end = at + 1;
  while (end < lines.length && /^[-•*]\s/.test(lines[end]!.trim())) end++;
  return [...lines.slice(0, at), ...lines.slice(end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** "Thông số nổi bật" trong mô tả (các dòng "- Nhãn: giá trị") */
function parseSpecs(description: string): Array<[string, string]> {
  const at = description.indexOf('Thông số nổi bật');
  if (at < 0) return [];
  return description
    .slice(at)
    .split('\n')
    .filter((l) => l.startsWith('- ') && l.includes(':'))
    .map((l) => {
      const [label, ...rest] = l.slice(2).split(':');
      return [label!.trim(), rest.join(':').trim()] as [string, string];
    });
}

function formatWeight(g: number): string {
  return g >= 1000
    ? `${(g / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} kg`
    : `${g} g`;
}

/**
 * Bảng thông số kỹ thuật (cột phải, bám theo khi cuộn): các dòng "Thông số nổi bật" trong mô tả, rồi phân
 * loại, khối lượng đóng gói, danh mục. Dòng chẵn lẻ xen màu nền như bảng thông số các trang bán lẻ.
 */
function SpecTable({ product }: { product: ProductDetail }) {
  const values = (group: 1 | 2) => [
    ...new Set(
      product.variants
        .map((v) => (group === 1 ? v.option1Value : v.option2Value))
        .filter((x): x is string => !!x),
    ),
  ];
  const rows: Array<[string, React.ReactNode]> = [...parseSpecs(product.description)];
  if (product.option1Name && values(1).length)
    rows.push([product.option1Name, values(1).join(', ')]);
  if (product.option2Name && values(2).length)
    rows.push([product.option2Name, values(2).join(', ')]);
  rows.push(['Khối lượng (đóng gói)', formatWeight(product.weight)]);
  rows.push([
    'Danh mục',
    <Link
      key="c"
      to={`/danh-muc/${product.category.slug}`}
      className="text-navy underline-offset-2 hover:underline"
    >
      {product.category.parent ? `${product.category.parent.name} › ` : ''}
      {product.category.name}
    </Link>,
  ]);

  return (
    <div className={cn(CARD, 'p-5 sm:p-6')}>
      <CardTitle>Thông số kỹ thuật</CardTitle>
      <dl className="mt-4 overflow-hidden rounded-xl ring-1 ring-ink/[0.07]">
        {rows.map(([k, v], i) => (
          <div
            key={k}
            className={cn(
              'grid grid-cols-[8.5rem_1fr] gap-3 px-3.5 py-2.5 text-[13px]',
              i % 2 === 0 && 'bg-page',
            )}
          >
            <dt className="text-ink/55">{k}</dt>
            <dd className="font-medium break-words text-charcoal">{v}</dd>
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
    <section className="relative mt-10">
      <SectionTitle title={title} more={moreLink} />
      <div className="relative">
        {items.length > 5 &&
          ([-1, 1] as const).map((dir) => (
            <button
              key={dir}
              type="button"
              aria-label={dir < 0 ? 'Xem trước' : 'Xem tiếp'}
              onClick={() => scrollBy(dir)}
              className={cn(
                'absolute top-[38%] z-10 hidden size-10 items-center justify-center rounded-full bg-card text-charcoal shadow-[0_8px_24px_-12px_rgba(15,26,61,0.45)] ring-1 ring-black/5 transition hover:bg-navy hover:text-white lg:flex',
                dir < 0 ? '-left-4' : '-right-4',
              )}
            >
              {dir < 0 ? (
                <IconChevronLeft className="size-5 [stroke-width:2]" />
              ) : (
                <IconChevronRight className="size-5 [stroke-width:2]" />
              )}
            </button>
          ))}
        <div
          ref={trackRef}
          className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden"
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
      </div>
    </section>
  );
}

/**
 * Thêm vào giỏ / Mua ngay: khách chưa đăng nhập thì sang trang đăng nhập rồi quay lại trang này. Thêm vào
 * giỏ hiện thông báo có ảnh; Mua ngay thêm vào giỏ rồi sang trang giỏ hàng.
 */
function useCartActions(product: ProductDetail, thumb: string | null) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useAddToCart();

  const ready = () => {
    if (session.status === 'loading') return false;
    if (session.status === 'guest') {
      const returnTo = location.pathname + location.search;
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`);
      return false;
    }
    return true;
  };
  const add = (variantId: string, quantity: number) => {
    if (!ready()) return;
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
  const buyNow = (variantId: string, quantity: number) => {
    if (!ready()) return;
    mutation.mutate(
      { variantId, quantity },
      { onSuccess: () => navigate('/gio-hang'), onError: toastCartError },
    );
  };
  return { add, buyNow, pending: mutation.isPending };
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
    <div className="flex w-[22rem] max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl bg-card p-3 font-sans shadow-[0_16px_40px_-16px_rgba(15,26,61,0.35)] ring-1 ring-black/5">
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-card p-1 ring-1 ring-ink/[0.08]">
        {image ? (
          <img src={image} alt="" className="size-full object-contain" />
        ) : (
          <IconShoppingCartPlus className="size-5 text-navy" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-charcoal">
          <IconCheck className="size-4 text-emerald-600 [stroke-width:2.5]" />
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
        className="self-start rounded-md p-1 text-ink/40 hover:bg-page hover:text-charcoal"
      >
        <IconX className="size-4" />
      </button>
    </div>
  );
}

/** Sản phẩm bị ẩn, shop bị đình chỉ hoặc không có: 404 */
function NotSelling() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-16">
      <div
        className={cn(CARD, 'mx-auto flex max-w-lg flex-col items-center px-6 py-14 text-center')}
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-champagne-50 text-navy">
          <IconPackageOff className="size-7 [stroke-width:1.5]" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-charcoal">Sản phẩm không còn bán</h1>
        <p className="mt-2 text-sm text-ink/60">
          Sản phẩm này đã ngừng bán, tạm ẩn hoặc đường dẫn không đúng.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/"
            className="inline-flex h-11 items-center gap-2 rounded-lg bg-navy px-6 text-sm font-semibold text-white transition hover:bg-navy-900"
          >
            <IconHome className="size-4 [stroke-width:1.75]" />
            Về trang chủ
          </Link>
          <Link
            to="/tim-kiem"
            className="inline-flex h-11 items-center rounded-lg border border-ink/15 px-6 text-sm font-semibold text-charcoal transition hover:border-navy/40 hover:text-navy"
          >
            Tìm sản phẩm khác
          </Link>
        </div>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4">
      <Skeleton className="my-4 h-4 w-72 max-w-full" />
      <div
        className={cn(
          CARD,
          'grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:p-8',
        )}
      >
        <div>
          <Skeleton className="aspect-square w-full rounded-2xl" />
          <div className="mt-3 hidden gap-2.5 md:flex">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="size-[4.5rem] rounded-xl" />
            ))}
          </div>
        </div>
        <div>
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="mt-3 h-4 w-1/2" />
          <Skeleton className="mt-5 h-20 w-full rounded-2xl" />
          <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
          <Skeleton className="mt-6 h-14 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
