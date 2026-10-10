import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BadgeCheck,
  ChevronRight,
  Clock,
  CreditCard,
  Flame,
  Headphones,
  Laptop,
  RotateCcw,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  UserPlus,
  Watch,
} from 'lucide-react';
import { Link } from 'react-router';
import { type ProductSearchParams, useProductSearch } from '@/components/catalog/browse-query';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/product-card';
import { type BannerContent, BannerCarousel, PromoBanner } from '@/components/catalog/promo-banner';
import { LoadError } from '@/components/console/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCategories } from '@/hooks/use-catalog';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import type { CategoryNode } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

const PROMISES = [
  { icon: Truck, title: 'Giao hàng qua GHN', text: 'Theo dõi vận đơn rõ ràng' },
  { icon: CreditCard, title: 'VNPay hoặc COD', text: 'Trả trước hay khi nhận hàng' },
  { icon: RotateCcw, title: 'Trả hàng, hoàn tiền', text: 'Sàn đứng ra phân xử' },
  { icon: BadgeCheck, title: 'Shop được duyệt', text: 'Kiểm duyệt hồ sơ trước khi bán' },
];

const SELLER_STEPS = [
  { icon: UserPlus, title: 'Tạo tài khoản', text: 'Đăng ký bằng email hoặc Google.' },
  { icon: Store, title: 'Nộp hồ sơ shop', text: 'Tên shop, logo, địa chỉ lấy hàng.' },
  { icon: BadgeCheck, title: 'Được duyệt và bán', text: 'Đăng sản phẩm là lên sàn ngay.' },
];

/** Banner trang chủ (vẽ bằng CSS; banner do admin đổi sẽ làm khi có bảng cấu hình) */
const HERO_SLIDES: BannerContent[] = [
  {
    tone: 'navy',
    eyebrow: 'Điện thoại',
    title: 'Điện thoại chính hãng',
    accent: 'Giá tốt từ nhiều shop',
    text: 'So giá iPhone, Samsung, Xiaomi… từ các shop đã được sàn kiểm duyệt.',
    cta: 'Mua ngay',
    to: '/danh-muc/dien-thoai',
    icon: Smartphone,
  },
  {
    tone: 'light',
    eyebrow: 'Laptop',
    title: 'Laptop cho mọi nhu cầu',
    accent: 'Học tập · Làm việc · Sáng tạo',
    text: 'MacBook và laptop Windows, giao tận nơi qua GHN.',
    cta: 'Khám phá',
    to: '/danh-muc/laptop',
    icon: Laptop,
  },
  {
    tone: 'champagne',
    eyebrow: 'Mua sắm nhiều shop',
    title: 'Một giỏ hàng, nhiều shop',
    accent: 'Chọn hàng thật dễ',
    text: 'Thêm hàng của nhiều shop vào cùng một giỏ, trả qua VNPay hoặc khi nhận hàng.',
    cta: 'Xem hàng mới',
    to: '/tim-kiem?sort=newest',
    icon: ShoppingBag,
  },
];

const SIDE_BANNERS: BannerContent[] = [
  {
    tone: 'navy',
    eyebrow: 'Đeo là chất',
    title: 'Đồng hồ thông minh',
    accent: 'Theo dõi sức khỏe',
    cta: 'Xem ngay',
    to: '/danh-muc/dong-ho-thong-minh',
    icon: Watch,
  },
  {
    tone: 'light',
    eyebrow: 'Nghe trọn vẹn',
    title: 'Âm thanh',
    accent: 'Tai nghe · Loa',
    cta: 'Xem ngay',
    to: '/danh-muc/am-thanh',
    icon: Headphones,
  },
];

function SectionTitle({
  icon: Icon,
  title,
  more,
  children,
}: {
  icon: LucideIcon;
  title: string;
  more?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 md:mb-5">
      <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-navy md:text-2xl">
        <span className="flex size-9 items-center justify-center rounded-xl bg-navy text-champagne">
          <Icon className="size-[18px]" />
        </span>
        {title}
      </h2>
      {children}
      {more && (
        <Link
          to={more}
          className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-navy transition hover:text-champagne-600"
        >
          Xem tất cả <ChevronRight className="size-4" />
        </Link>
      )}
    </div>
  );
}

/** Một khu sản phẩm: hàng cuộn ngang trên điện thoại, lưới 4–5 cột trên màn lớn */
function ProductSection({
  icon,
  title,
  more,
  params,
  chips,
  pageSize = 10,
  className,
}: {
  pageSize?: number;
  icon: LucideIcon;
  title: string;
  more: string;
  params: ProductSearchParams;
  chips?: CategoryNode[];
  className?: string;
}) {
  const q = useProductSearch({ pageSize, ...params });
  // Khu không có hàng thì ẩn hẳn
  if (q.data && q.data.items.length === 0) return null;

  const rowClass =
    '-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5 [&::-webkit-scrollbar]:hidden md:[&>*:nth-child(n+9)]:hidden lg:[&>*:nth-child(n+9)]:flex';
  const itemClass = 'w-[46%] shrink-0 snap-start sm:w-[31%] md:w-auto';

  return (
    <section className={cn('mx-auto max-w-7xl px-4', className)}>
      <SectionTitle icon={icon} title={title} more={more}>
        {chips && chips.length > 0 && (
          <div className="order-last flex w-full gap-2 overflow-x-auto [scrollbar-width:none] md:order-none md:w-auto [&::-webkit-scrollbar]:hidden">
            {chips.map((c) => (
              <Link
                key={c.id}
                to={`/danh-muc/${c.slug}`}
                className="h-8 shrink-0 rounded-full border border-ivory-200 bg-card px-3.5 text-[13px] leading-8 font-medium text-ink/75 transition hover:border-champagne hover:text-navy"
              >
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </SectionTitle>
      {q.isError ? (
        <div className="rounded-2xl border border-ivory-200 bg-card">
          <LoadError message={q.error.message} onRetry={() => void q.refetch()} />
        </div>
      ) : (
        <div className={rowClass}>
          {q.isPending
            ? Array.from({ length: 5 }, (_, i) => (
                <div key={i} className={itemClass}>
                  <ProductCardSkeleton />
                </div>
              ))
            : q.data.items.map((p) => <ProductCard key={p.id} product={p} className={itemClass} />)}
        </div>
      )}
    </section>
  );
}

function CategoryTiles({ tree, loading }: { tree: CategoryNode[]; loading: boolean }) {
  return (
    // Điện thoại đã có hàng icon danh mục ngay dưới header nên chỉ hiện khối này từ màn vừa trở lên
    <section className="mx-auto hidden max-w-7xl px-4 pt-10 md:block">
      <SectionTitle icon={Sparkles} title="Danh mục nổi bật" />
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0 lg:grid-cols-9 [&::-webkit-scrollbar]:hidden">
        {loading
          ? Array.from({ length: 9 }, (_, i) => (
              <Skeleton key={i} className="h-28 w-24 shrink-0 rounded-2xl md:w-auto" />
            ))
          : tree.map((c) => (
              <Link
                key={c.id}
                to={`/danh-muc/${c.slug}`}
                className="group flex w-24 shrink-0 flex-col items-center gap-2.5 rounded-2xl border border-ivory-200 bg-card px-2 pt-4 pb-3 text-center transition hover:-translate-y-0.5 hover:border-champagne/60 hover:shadow-[0_12px_28px_-14px_rgba(23,37,84,0.35)] md:w-auto"
              >
                <span className="flex size-12 items-center justify-center rounded-2xl bg-champagne-50 text-champagne-600 transition group-hover:bg-navy group-hover:text-champagne">
                  <CategoryIcon icon={c.icon} className="size-6" strokeWidth={1.6} />
                </span>
                <span className="line-clamp-2 min-h-8 text-xs leading-4 font-medium text-ink group-hover:text-navy">
                  {c.name}
                </span>
              </Link>
            ))}
      </div>
    </section>
  );
}

/**
 * Trang chủ khu mua hàng (docs/so-do/07 mục A): banner, cam kết, danh mục, các khu sản phẩm
 * lấy từ API, cuối trang mời mở shop.
 */
export function HomePage() {
  const session = useSession();
  const shop = useMyShop();
  const categories = useCategories();
  const tree = categories.data ?? [];
  const loggedIn = session.status === 'user';
  const hasShop = shop.data?.status === 'ACTIVE' || shop.data?.status === 'SUSPENDED';
  const shopCta = hasShop
    ? { to: '/kenh-nguoi-ban', label: 'Vào Kênh người bán' }
    : { to: loggedIn ? '/tai-khoan/shop' : '/dang-ky', label: 'Mở shop ngay' };

  // Khu "nổi bật" theo danh mục Điện thoại (không có thì lấy danh mục đầu tiên)
  const featured = tree.find((c) => c.slug === 'dien-thoai') ?? tree[0];

  return (
    <>
      {/* Banner: 1 lớn trượt + 2 nhỏ bên phải */}
      <section className="mx-auto max-w-7xl px-4 pt-4 md:pt-6">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <BannerCarousel slides={HERO_SLIDES} className="h-52 sm:h-64 md:h-[22rem]" />
          <div className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
            {SIDE_BANNERS.map((b) => (
              <PromoBanner key={b.title} banner={b} size="sm" className="h-40 lg:h-auto" />
            ))}
          </div>
        </div>
      </section>

      {/* Cam kết của sàn */}
      <section className="mx-auto max-w-7xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-x-3 gap-y-4 rounded-2xl border border-ivory-200 bg-card px-4 py-4 lg:grid-cols-4 lg:divide-x lg:divide-ivory-200 lg:px-2">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-center gap-3 lg:justify-center lg:px-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600 sm:size-10">
                <Icon className="size-[18px] sm:size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-navy md:text-sm">{title}</div>
                <p className="hidden text-xs text-ink/55 sm:block">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <CategoryTiles tree={tree} loading={categories.isPending} />

      {featured && (
        <ProductSection
          className="pt-12"
          pageSize={5}
          icon={Smartphone}
          title={`${featured.name} nổi bật`}
          more={`/danh-muc/${featured.slug}?sort=best_selling`}
          params={{ categoryId: featured.id, sort: 'best_selling' }}
          chips={featured.children}
        />
      )}
      <ProductSection
        className="pt-12"
        icon={Clock}
        title="Hàng mới về"
        more="/tim-kiem?sort=newest"
        params={{ sort: 'newest' }}
      />
      <ProductSection
        className="pt-12"
        icon={Flame}
        title="Bán chạy"
        more="/tim-kiem?sort=best_selling"
        params={{ sort: 'best_selling' }}
      />

      {/* Mời mở shop (từ trang chủ P1) */}
      <section className="mx-auto max-w-7xl px-4 pt-14">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-navy-900 via-navy to-navy-800 px-6 py-10 text-white md:px-12 md:py-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-20 size-80 rounded-full bg-champagne/15 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-28 left-10 size-64 rounded-full border border-champagne/20"
          />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="inline-flex items-center rounded-full border border-champagne/40 px-3 py-1 text-xs tracking-wide text-champagne">
                Dành cho người bán
              </span>
              <h2 className="mt-4 text-2xl leading-tight font-bold md:text-3xl">
                Bán hàng cùng {BRAND}
              </h2>
              <p className="mt-2 text-sm text-white/70 md:text-base">
                Phí sàn <b className="text-champagne">5%</b>, chỉ tính trên đơn giao thành công.
              </p>
              <Button
                asChild
                size="lg"
                className="mt-6 rounded-full bg-champagne px-7 text-navy hover:bg-champagne-50"
              >
                <Link to={shopCta.to}>
                  {shopCta.label} <ArrowRight />
                </Link>
              </Button>
            </div>
            <ol className="grid gap-3 sm:grid-cols-3">
              {SELLER_STEPS.map(({ icon: Icon, title, text }, i) => (
                <li
                  key={title}
                  className="relative rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
                >
                  <span className="absolute top-4 right-4 text-3xl font-bold text-champagne/25">
                    {i + 1}
                  </span>
                  <Icon className="size-6 text-champagne" />
                  <div className="mt-3 font-semibold">{title}</div>
                  <p className="mt-1 text-sm text-white/65">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
