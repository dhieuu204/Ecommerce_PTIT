import { IconArrowRight } from '@tabler/icons-react';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useProductSearch } from '@/components/catalog/browse-query';
import { CategoryIcon } from '@/components/catalog/category-icon';
import {
  ProductCard,
  ProductCardSkeleton,
  type ProductCardVariant,
} from '@/components/catalog/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CategoryNode, ProductCardData } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

/**
 * Danh sách bán chạy dùng chung cho khung voucher, khu giảm giá và shop nổi bật: cùng tham số nên
 * React Query chỉ gọi API một lần.
 */
export const HOME_BEST_SELLING = { sort: 'best_selling' as const, pageSize: 40 };

// ----- Hiện dần khi cuộn tới -----

/** Khu đã cuộn tới chưa: các hàng thẻ bên trong dùng để hiện lần lượt (ngoài Reveal thì luôn hiện) */
const RevealContext = createContext(true);

/** Lớp và độ trễ cho phần tử thứ `index` hiện lần lượt khi khu cuộn tới (5 phần tử một nhịp) */
export function useStagger() {
  const shown = useContext(RevealContext);
  return (index: number) => ({
    className: cn(
      'transition-[opacity,translate] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
      shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
    ),
    style: { transitionDelay: shown ? `${(index % 5) * 70}ms` : '0ms' },
  });
}

/**
 * Bọc một khu để nó hiện dần (mờ → rõ, trượt nhẹ lên) khi cuộn tới. Người dùng chọn giảm chuyển động
 * thì hiện luôn.
 */
export function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
      typeof IntersectionObserver === 'undefined'
    ) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={cn(
        'transition-all duration-700 ease-out',
        shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0',
        className,
      )}
    >
      <RevealContext.Provider value={shown}>{children}</RevealContext.Provider>
    </div>
  );
}

// ----- Tiêu đề khu -----

/** Link "Xem tất cả →" bên phải tiêu đề khu */
function MoreLink({ to, dark }: { to: string; dark?: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold transition',
        dark ? 'text-white hover:text-white/80' : 'text-navy hover:text-navy-900',
      )}
    >
      Xem tất cả
      <IconArrowRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
    </Link>
  );
}

/**
 * Tiêu đề khu (thiết kế HK-Shop-Homepage-Sections):
 * - mặc định: gạch cam ngắn phía trước tiêu đề đậm, dòng phụ xám bên dưới (nếu có);
 * - có `kicker`: dòng chữ hoa nhỏ màu cam có gạch phía trước, tiêu đề lớn hơn bên dưới.
 */
export function SectionTitle({
  title,
  subtitle,
  kicker,
  more,
}: {
  title: React.ReactNode;
  subtitle?: string;
  kicker?: string;
  more?: string;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4 md:mb-5">
      {kicker ? (
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.1em] text-navy uppercase">
            <span aria-hidden className="h-0.5 w-3.5 rounded-full bg-navy" />
            {kicker}
          </p>
          <h2 className="mt-1.5 text-lg leading-tight font-bold tracking-tight text-charcoal md:text-[1.375rem]">
            {title}
          </h2>
        </div>
      ) : (
        <div className="min-w-0">
          <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-charcoal md:text-lg">
            <span aria-hidden className="h-[3px] w-5 shrink-0 rounded-full bg-navy" />
            {title}
          </h2>
          {subtitle && <p className="mt-1 pl-8 text-xs text-ink/55">{subtitle}</p>}
        </div>
      )}
      {more && <MoreLink to={more} />}
    </div>
  );
}

// ----- Mua theo danh mục -----

/** Ảnh sản phẩm đại diện cho từng danh mục cấp 1 (public/home); danh mục khác hiện icon */
const CATEGORY_ART: Record<string, string> = {
  'dien-thoai': '/home/iphone-17-pro-max.webp',
  laptop: '/home/macbook-air-m5.webp',
  'may-tinh-bang': '/home/ipad-air-m4.webp',
  'dong-ho-thong-minh': '/home/apple-watch-s11.webp',
  'am-thanh': '/home/airpods-pro-3.webp',
  'man-hinh-pc': '/home/imac-24-m4.webp',
  gaming: '/home/ps5-pro.webp',
  'phu-kien': '/home/sac-du-phong-anker.webp',
};

/** Tên ngắn cho ô danh mục hẹp (tên đầy đủ bị cắt dở trông cẩu thả); thanh danh mục vẫn ghi tên đầy đủ */
const CATEGORY_SHORT_NAME: Record<string, string> = {
  'dong-ho-thong-minh': 'Đồng hồ',
};

/** Tối đa bao nhiêu danh mục trên một hàng, và lớp cột tương ứng (Tailwind cần tên lớp viết sẵn) */
const SHOWCASE_MAX = 8;
const SHOWCASE_COLS: Record<number, string> = {
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  7: 'md:grid-cols-7',
  8: 'md:grid-cols-8',
};

/**
 * Mua theo danh mục (thiết kế 06-category-grid): một hàng thẻ trắng, mỗi danh mục cấp 1 một thẻ (sàn chuyên
 * đồ điện tử, tối đa 8), ảnh sản phẩm thật trên nền trắng (mọi ảnh cùng cỡ vật thể nhờ normalize-demo-images)
 * và tên danh mục bên dưới. Số cột theo số danh mục để hàng luôn kín. Màn nhỏ: cuộn ngang.
 */
export function CategoryShowcase({ tree, loading }: { tree: CategoryNode[]; loading: boolean }) {
  const items = tree.slice(0, SHOWCASE_MAX);
  const cols = SHOWCASE_COLS[loading ? 7 : items.length] ?? 'md:grid-cols-8';
  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
      <SectionTitle title="Mua theo danh mục" />
      <div
        className={cn(
          '-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:grid md:gap-4 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden',
          cols,
        )}
      >
        {loading
          ? Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="w-[6.5rem] shrink-0 rounded-xl bg-card p-2 pb-3 md:w-auto">
                <Skeleton className="aspect-square w-full rounded-lg" />
                <Skeleton className="mx-auto mt-3 h-3.5 w-2/3" />
              </div>
            ))
          : items.map((c, i) => <CategoryTile key={c.id} category={c} index={i} />)}
      </div>
    </section>
  );
}

function CategoryTile({ category: c, index }: { category: CategoryNode; index: number }) {
  const art = CATEGORY_ART[c.slug];
  const s = useStagger()(index);
  return (
    <Link
      to={`/danh-muc/${c.slug}`}
      className={cn('group w-32 shrink-0 snap-start outline-none md:w-auto', s.className)}
      style={s.style}
    >
      <span className="block rounded-xl bg-card p-3 pb-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_18px_36px_-22px_rgba(15,23,42,0.4)] group-focus-visible:ring-2 group-focus-visible:ring-champagne">
        <span className="flex aspect-[4/3] items-center justify-center overflow-hidden">
          {art ? (
            <img
              src={art}
              alt=""
              aria-hidden
              loading="lazy"
              decoding="async"
              width={640}
              height={640}
              className="h-full w-auto object-contain transition duration-500 ease-out group-hover:scale-[1.07]"
            />
          ) : (
            <CategoryIcon icon={c.icon} aria-hidden className="size-10 text-ink/30" />
          )}
        </span>
        <span className="mt-2.5 block truncate text-center text-[13px] font-semibold text-charcoal transition-colors group-hover:text-navy md:text-sm">
          {CATEGORY_SHORT_NAME[c.slug] ?? c.name}
        </span>
      </span>
    </Link>
  );
}

// ----- Hàng thẻ sản phẩm -----

/**
 * Hàng thẻ sản phẩm: cuộn ngang trên điện thoại, lưới 4 cột (máy tính bảng) / 5 cột (máy tính).
 * `rows`: số hàng trên màn lớn; ở lưới 4 cột thẻ dư bị ẩn để không lẻ hàng.
 */
export function ProductRow({
  items,
  loading,
  variant = 'default',
  rows = 1,
  className,
}: {
  items: ProductCardData[];
  loading: boolean;
  variant?: ProductCardVariant;
  rows?: 1 | 2;
  className?: string;
}) {
  const skeletons = rows * 5;
  const itemClass = 'w-[46%] shrink-0 snap-start sm:w-[31%] md:w-auto';
  const stagger = useStagger();
  return (
    <div
      className={cn(
        '-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5 [&::-webkit-scrollbar]:hidden',
        rows === 1
          ? 'md:[&>*:nth-child(n+5)]:hidden lg:[&>*:nth-child(n+5)]:flex'
          : 'md:[&>*:nth-child(n+9)]:hidden lg:[&>*:nth-child(n+9)]:flex',
        className,
      )}
    >
      {loading
        ? Array.from({ length: skeletons }, (_, i) => (
            <div key={i} className={itemClass}>
              <ProductCardSkeleton variant={variant} />
            </div>
          ))
        : items.map((p, i) => {
            const s = stagger(i);
            return (
              <div key={p.id} className={cn(itemClass, 'flex', s.className)} style={s.style}>
                <ProductCard product={p} variant={variant} className="w-full" />
              </div>
            );
          })}
    </div>
  );
}

// ----- Laptop nổi bật -----

/**
 * Laptop nổi bật (thiết kế 09-featured-laptops): ô quảng cáo lớn bên trái (rộng bằng 2 thẻ) + 4 thẻ
 * laptop bán chạy. Không có hàng thì ẩn cả khu.
 */
export function FeaturedLaptops({ category }: { category: CategoryNode }) {
  const q = useProductSearch({ categoryId: category.id, sort: 'best_selling', pageSize: 4 });
  if (q.data && q.data.items.length === 0) return null;
  if (q.isError) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
      <SectionTitle
        title={`${category.name} nổi bật`}
        more={`/danh-muc/${category.slug}?sort=best_selling`}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 lg:grid-cols-6">
        <LaptopPromoTile to={`/danh-muc/${category.slug}`} />
        {q.isPending
          ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} variant="wide" />)
          : q.data.items.map((p, i) => <StaggerCard key={p.id} product={p} index={i + 1} />)}
      </div>
    </section>
  );
}

/**
 * Ảnh thật cho ô quảng cáo laptop (ảnh MacBook Air của apple.com, đặt trong public/home/banners-temp, KHÔNG
 * commit, xem .gitignore). Máy không có file thì ô tự dựng nền tối + ảnh MacBook đã cắt nền.
 */
const LAPTOP_TILE_PHOTO = '/home/banners-temp/laptop-tile.webp';

/**
 * Ô quảng cáo bên trái khu laptop (rộng bằng 2 thẻ), kiểu ô quảng cáo của apple.com / CellphoneS: ảnh phủ kín
 * ô, lớp tối dần từ góc dưới trái để chữ trắng nổi, nhãn kính mờ, tiêu đề lớn, nút trắng "Khám phá ngay". Rê
 * chuột thì ảnh phóng nhẹ.
 */
function LaptopPromoTile({ to }: { to: string }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <Link
      to={to}
      className="group relative isolate col-span-2 flex min-h-72 flex-col justify-end overflow-hidden rounded-2xl bg-charcoal p-6 text-white focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none md:col-span-4 md:min-h-80 md:p-7 lg:col-span-2"
    >
      {photoFailed ? (
        <>
          {/* Không có ảnh thật: nền than chuyển sắc, quầng sáng xanh, MacBook đã cắt nền */}
          <div
            aria-hidden
            className="absolute inset-0 -z-20 bg-[radial-gradient(70%_60%_at_70%_30%,rgba(125,170,220,0.45),transparent_70%)]"
          />
          <img
            src="/home/cut/macbook-air-m5.webp"
            alt=""
            aria-hidden
            loading="lazy"
            decoding="async"
            className="absolute top-[8%] right-[-8%] -z-10 w-[78%] object-contain transition duration-700 ease-out group-hover:scale-[1.05] md:w-[46%] lg:w-[80%]"
          />
        </>
      ) : (
        <img
          src={LAPTOP_TILE_PHOTO}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          onError={() => setPhotoFailed(true)}
          className="absolute inset-0 -z-20 size-full object-cover object-[62%_center] transition duration-700 ease-out group-hover:scale-[1.05]"
        />
      )}
      {/* Lớp tối dần để chữ đọc rõ trên mọi ảnh */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/30 to-transparent"
      />

      <span className="w-fit rounded-lg bg-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide uppercase ring-1 ring-white/25 backdrop-blur-md">
        Mỏng nhẹ. Mạnh mẽ.
      </span>
      <h3 className="mt-3 text-2xl leading-tight font-bold tracking-tight md:text-[1.75rem]">
        Làm việc ở bất cứ đâu.
      </h3>
      <p className="mt-1.5 max-w-xs text-sm text-white/80">
        MacBook, Asus và nhiều mẫu laptop chính hãng từ các shop đã được sàn kiểm duyệt.
      </p>
      <span className="mt-4 inline-flex h-10 w-fit items-center gap-1.5 rounded-lg bg-white px-4 text-sm font-semibold text-charcoal transition group-hover:bg-champagne-50">
        Khám phá ngay
        <IconArrowRight className="size-4 [stroke-width:2] transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

/** Thẻ laptop hiện lần lượt (ô giới thiệu tính là phần tử đầu) */
function StaggerCard({ product, index }: { product: ProductCardData; index: number }) {
  const s = useStagger()(index);
  return (
    <div className={cn('flex', s.className)} style={s.style}>
      <ProductCard product={product} variant="wide" className="w-full" />
    </div>
  );
}
