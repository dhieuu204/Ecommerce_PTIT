import {
  IconArrowRight,
  IconBattery3,
  IconCamera,
  IconCheck,
  IconCpu,
  IconCreditCard,
  IconDeviceMobile,
  IconRosetteDiscountCheckFilled,
  IconShieldCheck,
  IconShoppingCartPlus,
  IconStarFilled,
  IconTruckDelivery,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useProductSearch } from '@/components/catalog/browse-query';
import { discountPercent, formatSold } from '@/components/catalog/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAddToCart } from '@/hooks/use-cart';
import { API, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { toastCartError } from '@/lib/cart-errors';
import type { ProductDetail } from '@/lib/catalog-types';
import { isColorOption, swatchColor } from '@/lib/color-swatch';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type Selection,
  findVariant,
  group1Choices,
  group2Choices,
  initialSelection,
  pickGroup1,
} from '@/lib/variants';
import { HOME_BEST_SELLING } from './home-sections';

/**
 * Sản phẩm đặt ở khối tiêu điểm (chủ đồ án chọn 02/11/2026). Không tìm thấy (shop gỡ, hết hàng) thì lấy sản
 * phẩm bán chạy nhất có nhiều màu.
 */
const SPOTLIGHT_NAME = 'Điện thoại iPhone 18 Pro Max';

/** Nhóm thông số nổi bật hiện ở khối tiêu điểm: chọn dòng theo nhãn, mỗi nhóm một icon */
const SPEC_GROUPS = [
  { match: /chip|cpu/i, icon: IconCpu },
  { match: /camera/i, icon: IconCamera },
  { match: /kích thước màn hình|màn hình/i, icon: IconDeviceMobile },
  { match: /pin/i, icon: IconBattery3 },
];

/** "Thông số nổi bật" trong mô tả (các dòng "- Nhãn: giá trị") */
function parseSpecs(description: string): Array<{ label: string; value: string }> {
  const at = description.indexOf('Thông số nổi bật');
  if (at < 0) return [];
  return description
    .slice(at)
    .split('\n')
    .filter((l) => l.startsWith('- ') && l.includes(':'))
    .map((l) => {
      const [label, ...rest] = l.slice(2).split(':');
      return { label: label!.trim(), value: rest.join(':').trim() };
    });
}

/** Tối đa 4 thông số theo thứ tự chip, camera, màn hình, pin; thiếu nhóm nào thì bỏ nhóm đó */
function highlightSpecs(description: string) {
  const specs = parseSpecs(description);
  return SPEC_GROUPS.flatMap(({ match, icon }) => {
    const s = specs.find((x) => match.test(x.label));
    return s ? [{ ...s, icon }] : [];
  });
}

/** Ảnh theo màu đang chọn; màu không có ảnh riêng thì dùng ảnh chung */
function imagesFor(product: ProductDetail, color: string | null): string[] {
  const own = product.images.filter((i) => i.option1Value === color).map((i) => i.url);
  if (own.length) return own;
  const common = product.images.filter((i) => i.option1Value === null).map((i) => i.url);
  return common.length ? common : product.images.map((i) => i.url);
}

/** Ảnh nghiêng nhẹ theo con trỏ (tắt khi người dùng chọn giảm chuyển động) */
function useTilt() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useRef(false);
  useEffect(() => {
    reduce.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }, []);
  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    if (reduce.current || !ref.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.transform = `perspective(900px) rotateY(${x * 8}deg) rotateX(${-y * 6}deg) scale(1.02)`;
  };
  const onMouseLeave = () => {
    if (ref.current) ref.current.style.transform = '';
  };
  return { ref, onMouseMove, onMouseLeave };
}

/**
 * Khối sản phẩm tiêu điểm giữa trang chủ (tham khảo trang sản phẩm apple.com và CellphoneS): bên trái ảnh rất
 * lớn trên nền ửng theo màu máy đang chọn, hàng ảnh nhỏ; bên phải tên, đánh giá, khối giá, chọn dung lượng
 * (thẻ có giá từng bản) và màu (chip chấm màu + tên), 4 thông số nổi bật có icon, nút Mua ngay / Thêm vào giỏ,
 * hàng cam kết. Chọn phân loại thì ảnh, giá, tình trạng đổi theo dữ liệu thật; khách chưa đăng nhập bấm mua
 * thì sang trang đăng nhập rồi quay lại.
 */
export function ProductSpotlight() {
  const featured = useProductSearch({ q: SPOTLIGHT_NAME, pageSize: 5 });
  const list = useProductSearch(HOME_BEST_SELLING);
  const chosen = featured.data?.items.find(
    // So đúng tên đầy đủ: phụ kiện (ốp lưng "...iPhone 18 Pro Max...") cũng khớp từ khóa tìm kiếm
    (p) => p.inStock && p.name.trim().toLowerCase() === SPOTLIGHT_NAME.toLowerCase(),
  );
  const fallback = list.data?.items.find(
    (p) =>
      p.inStock && p.option1Values.length >= 2 && isColorOption(p.option1Name, p.option1Values),
  );
  const pick = featured.data ? (chosen ?? fallback) : undefined;
  const detail = useQuery({
    queryKey: ['product', pick?.id],
    queryFn: () => api<ProductDetail>(`${API.market}/products/${pick!.id}`),
    enabled: !!pick,
  });

  if (featured.data && list.data && !pick) return null;
  if (detail.isError) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
      {detail.data ? (
        <SpotlightCard product={detail.data} createdAt={pick!.createdAt} />
      ) : (
        <Skeleton className="h-[38rem] rounded-3xl" />
      )}
    </section>
  );
}

/** Đăng trong khoảng này thì gắn nhãn "Mới ra mắt" */
const NEW_DAYS = 45;

function SpotlightCard({ product, createdAt }: { product: ProductDetail; createdAt: string }) {
  const [sel, setSel] = useState<Selection>(() => initialSelection(product.variants));
  const [imageIndex, setImageIndex] = useState(0);
  const tilt = useTilt();
  const variant = findVariant(product.variants, sel);
  const colors = group1Choices(product.variants);
  const sizes = product.option2Name ? group2Choices(product.variants, sel) : [];
  const images = useMemo(() => imagesFor(product, sel.o1), [product, sel.o1]);
  const image = images[Math.min(imageIndex, images.length - 1)] ?? null;
  const specs = useMemo(() => highlightSpecs(product.description), [product.description]);
  const price = variant?.price ?? product.minPrice;
  const original = variant?.originalPrice ?? null;
  const percent = discountPercent(price, original);
  const available = variant?.available ?? 0;
  const cart = useSpotlightCart(product.name);
  const showSwatches = isColorOption(
    product.option1Name,
    colors.map((c) => c.value),
  );
  // Nền khung ảnh ửng theo màu máy đang chọn
  const tint = (sel.o1 && swatchColor(sel.o1)) || null;
  const isNew = Date.now() - new Date(createdAt).getTime() < NEW_DAYS * 24 * 60 * 60 * 1000;

  return (
    <div className="grid overflow-hidden rounded-3xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)] lg:grid-cols-[1.08fr_1fr]">
      {/* Ảnh lớn */}
      <div
        className="relative isolate flex min-h-[24rem] flex-col items-center justify-center overflow-hidden bg-page px-6 pt-14 pb-6 md:min-h-[34rem]"
        onMouseMove={tilt.onMouseMove}
        onMouseLeave={tilt.onMouseLeave}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-[background] duration-700"
          style={{
            background: tint
              ? `radial-gradient(60% 55% at 50% 45%, ${tint}38 0%, transparent 70%)`
              : undefined,
          }}
        />
        <div className="absolute top-5 left-5 flex flex-wrap gap-2">
          {isNew && (
            <span className="rounded-lg bg-navy px-2.5 py-1 text-xs font-bold text-white">
              Mới ra mắt
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-lg bg-card/90 px-2.5 py-1 text-xs font-semibold text-charcoal shadow-sm">
            <IconRosetteDiscountCheckFilled className="size-4 text-navy" />
            Chính hãng VN/A
          </span>
        </div>

        <div
          ref={tilt.ref}
          // Hòa nền trắng của ảnh vào nền khung: khung có transform nên tạo lớp riêng, mix-blend đặt trên ảnh
          // sẽ chỉ hòa với lớp trong suốt và lộ ô vuông trắng
          className="relative flex aspect-square w-full max-w-[28rem] items-center justify-center mix-blend-multiply transition-transform duration-300 ease-out will-change-transform"
        >
          {image && (
            <img
              key={image}
              src={image}
              alt={`${product.name}${sel.o1 ? `, màu ${sel.o1}` : ''}`}
              className="size-full object-contain animate-in fade-in-0 zoom-in-95 duration-500"
            />
          )}
        </div>

        {images.length > 1 && (
          <div className="mt-5 flex gap-2.5">
            {images.slice(0, 5).map((src, i) => (
              <button
                key={src}
                type="button"
                aria-label={`Ảnh ${i + 1}`}
                aria-current={src === image}
                onClick={() => setImageIndex(i)}
                className={cn(
                  'size-16 overflow-hidden rounded-xl bg-card p-1.5 shadow-sm ring-1 transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none',
                  src === image ? 'ring-2 ring-navy' : 'ring-black/5 hover:ring-navy/40',
                )}
              >
                <img src={src} alt="" className="size-full object-contain" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thông tin và chọn phân loại */}
      <div className="flex flex-col p-6 md:p-9">
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-navy uppercase">
          <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-navy" />
          Sản phẩm tiêu điểm
        </p>
        <h2 className="mt-2 text-xl leading-tight font-bold tracking-tight text-charcoal md:text-[1.75rem]">
          {product.name}
        </h2>
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/60">
          {product.ratingAvg !== null && product.ratingCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1 font-medium text-ink/80">
                <IconStarFilled className="size-4 text-champagne" />
                {product.ratingAvg.toFixed(1)}
                <span className="font-normal text-ink/55">({product.ratingCount} đánh giá)</span>
              </span>
              <span aria-hidden className="h-3.5 w-px bg-ink/15" />
            </>
          )}
          {product.soldCount > 0 && (
            <>
              <span>Đã bán {formatSold(product.soldCount)}</span>
              <span aria-hidden className="h-3.5 w-px bg-ink/15" />
            </>
          )}
          <Link
            to={`/shop/${product.shop.id}`}
            className="font-medium text-charcoal underline-offset-4 hover:text-navy hover:underline"
          >
            {product.shop.name}
          </Link>
        </div>

        {/* Khối giá */}
        <div className="mt-5 rounded-2xl bg-gradient-to-r from-champagne-50 to-card px-5 py-4 ring-1 ring-navy/10">
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span
              key={price}
              className="text-[1.75rem] leading-none font-bold tracking-tight text-navy animate-in fade-in-0 slide-in-from-bottom-1 duration-300 md:text-3xl"
            >
              {formatMoney(price)}
            </span>
            {percent > 0 && (
              <>
                <span className="text-sm text-ink/45 line-through">{formatMoney(original!)}</span>
                <span className="rounded-md bg-navy px-1.5 py-0.5 text-xs font-bold text-white">
                  -{percent}%
                </span>
              </>
            )}
          </div>
          {percent > 0 && (
            <p className="mt-1.5 text-xs text-ink/60">
              Tiết kiệm <b className="font-semibold text-navy">{formatMoney(original! - price)}</b>{' '}
              so với giá gốc
            </p>
          )}
        </div>

        {/* Dung lượng (nhóm 2): thẻ có giá từng bản theo màu đang chọn */}
        {sizes.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-charcoal">{product.option2Name}</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {sizes.map((s) => {
                const on = s.value === sel.o2;
                const v = findVariant(product.variants, { o1: sel.o1, o2: s.value });
                return (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={on}
                    disabled={s.disabled}
                    onClick={() => setSel({ ...sel, o2: s.value })}
                    className={cn(
                      'relative flex flex-col items-center rounded-lg border px-2 py-2 transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                      on ? 'border-navy bg-champagne-50' : 'border-ink/15 hover:border-navy/50',
                    )}
                  >
                    <span className={cn('text-sm font-bold', on ? 'text-navy' : 'text-charcoal')}>
                      {s.value}
                    </span>
                    <span className="mt-0.5 text-xs text-ink/55">
                      {s.disabled ? 'Hết hàng' : v ? formatMoney(v.price) : ''}
                    </span>
                    {on && (
                      <span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-bl-md rounded-tr-[7px] bg-navy text-white">
                        <IconCheck className="size-3 [stroke-width:3]" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Màu (nhóm 1): chip chấm màu + tên */}
        {colors.length > 0 && product.option1Name && (
          <div className="mt-5">
            <p className="text-sm font-medium text-charcoal">
              {product.option1Name}: <span className="font-normal text-ink/60">{sel.o1}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c) => {
                const on = c.value === sel.o1;
                const swatch = swatchColor(c.value);
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.disabled ? `${c.value} (hết hàng)` : c.value}
                    aria-pressed={on}
                    disabled={c.disabled}
                    onClick={() => {
                      setSel(pickGroup1(product.variants, sel, c.value));
                      setImageIndex(0);
                    }}
                    className={cn(
                      'inline-flex h-10 items-center gap-2 rounded-lg border pr-3.5 pl-2.5 text-sm transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40',
                      on
                        ? 'border-navy bg-champagne-50 font-semibold text-navy'
                        : 'border-ink/15 text-charcoal hover:border-navy/50',
                    )}
                  >
                    {showSwatches && swatch && (
                      <span
                        aria-hidden
                        className="size-5 rounded-full ring-1 ring-black/10"
                        style={{ backgroundColor: swatch }}
                      />
                    )}
                    {c.value}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Thông số nổi bật */}
        {specs.length > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-3.5 border-t border-ink/[0.07] pt-5">
            {specs.map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex min-w-0 gap-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-page text-charcoal">
                  <Icon className="size-[1.125rem] [stroke-width:1.5]" />
                </span>
                <div className="min-w-0">
                  <dt className="truncate text-xs text-ink/50">{label}</dt>
                  <dd
                    className="line-clamp-2 text-[13px] leading-snug font-semibold text-charcoal"
                    title={value}
                  >
                    {value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        )}

        {/* Nút mua */}
        <div className="mt-auto pt-7">
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={!variant || available <= 0 || cart.pending}
              onClick={() => variant && cart.buyNow(variant.id)}
              className="flex h-12 flex-1 flex-col items-center justify-center rounded-lg bg-gradient-to-r from-header-from to-header-to text-white shadow-[0_12px_24px_-12px_rgba(238,77,45,0.7)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-[15px] leading-tight font-bold">
                {available > 0 ? 'Mua ngay' : 'Tạm hết hàng'}
              </span>
              {available > 0 && (
                <span className="text-[11px] leading-tight opacity-90">
                  Giao tận nơi hoặc nhận hàng rồi trả tiền
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="Thêm vào giỏ"
              title="Thêm vào giỏ"
              disabled={!variant || available <= 0 || cart.pending}
              onClick={() => variant && cart.add(variant.id)}
              className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-lg border border-navy text-navy transition hover:bg-champagne-50 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconShoppingCartPlus className="size-5 [stroke-width:1.75]" />
              <span className="text-[10px] leading-tight font-medium">Thêm giỏ</span>
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            {available > 0 && available <= 5 ? (
              <span className="font-medium text-navy">Chỉ còn {available} sản phẩm</span>
            ) : (
              <span className="text-ink/50">Còn hàng, sẵn sàng giao</span>
            )}
            <Link
              to={`/san-pham/${product.id}`}
              className="group inline-flex items-center gap-1 font-semibold text-charcoal transition hover:text-navy"
            >
              Xem chi tiết
              <IconArrowRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        {/* Cam kết */}
        <ul className="mt-5 grid grid-cols-3 gap-2 border-t border-ink/[0.07] pt-4 text-[11px] leading-snug text-ink/60 md:text-xs">
          {[
            { icon: IconShieldCheck, text: 'Chính hãng, bảo hành 12 tháng' },
            { icon: IconTruckDelivery, text: 'Giao hàng qua GHN' },
            { icon: IconCreditCard, text: 'VNPay hoặc COD' },
          ].map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-1.5">
              <Icon className="size-4 shrink-0 text-navy [stroke-width:1.5]" />
              {text}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Thêm vào giỏ / Mua ngay từ khối tiêu điểm: khách chưa đăng nhập thì sang trang đăng nhập rồi quay lại
 * trang chủ; Mua ngay = thêm vào giỏ rồi sang trang giỏ hàng.
 */
function useSpotlightCart(name: string) {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const mutation = useAddToCart();
  const ready = () => {
    if (session.status === 'loading') return false;
    if (session.status === 'guest') {
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(location.pathname)}`);
      return false;
    }
    return true;
  };
  const add = (variantId: string) => {
    if (!ready()) return;
    mutation.mutate(
      { variantId, quantity: 1 },
      {
        onSuccess: () =>
          toast.success('Đã thêm vào giỏ', {
            description: name,
            action: { label: 'Xem giỏ', onClick: () => navigate('/gio-hang') },
          }),
        onError: toastCartError,
      },
    );
  };
  const buyNow = (variantId: string) => {
    if (!ready()) return;
    mutation.mutate(
      { variantId, quantity: 1 },
      { onSuccess: () => navigate('/gio-hang'), onError: toastCartError },
    );
  };
  return { add, buyNow, pending: mutation.isPending };
}
