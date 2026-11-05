import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/** Một banner chỉ là ảnh (chữ nằm sẵn trong ảnh), bấm vào thì sang trang tương ứng */
interface BannerImage {
  src: string;
  /** Mô tả ảnh cho trình đọc màn hình: chính là chữ in trên banner (hoặc tên sản phẩm trong ảnh) */
  alt: string;
  to: string;
}

interface Banner extends BannerImage {
  /**
   * Ảnh mượn tạm trên máy chủ đồ án (public/home/banners-temp, KHÔNG commit, xem .gitignore). Có file thì
   * hiện ảnh này; máy khác không có file thì tự dùng banner HK Shop ở trên.
   */
  temp?: BannerImage;
}

/** Mỗi banner hiện bao lâu trước khi tự chuyển */
const SLIDE_MS = 6000;

/**
 * Ảnh banner đặt ở public/home/banners (chưa có bảng banner do admin đổi). Ảnh hiện tại là ảnh tạm của HK
 * Shop, dựng bằng scripts/render-home-banners.mjs từ ảnh sản phẩm demo; có ảnh thiết kế thật thì chỉ cần
 * thay file cùng tên. Khung banner tỉ lệ 23:10 (như banner các trang bán lẻ); ảnh khác tỉ lệ bị cắt bớt mép.
 */
const SLIDES: Banner[] = [
  {
    src: '/home/banners/hero-dien-thoai.webp',
    alt: 'iPhone, Galaxy chính hãng: giá tốt mỗi ngày từ các shop đã được sàn kiểm duyệt',
    to: '/danh-muc/dien-thoai',
    temp: {
      src: '/home/banners-temp/hero-1.webp',
      alt: 'Sony Xperia 1 VII',
      to: '/danh-muc/dien-thoai',
    },
  },
  {
    src: '/home/banners/hero-laptop.webp',
    alt: 'Mỏng nhẹ, mạnh mẽ: MacBook, iPad và laptop Windows, giao tận nơi qua GHN',
    to: '/danh-muc/laptop',
    temp: {
      src: '/home/banners-temp/hero-2.webp',
      alt: 'OPPO Find X10 Series',
      to: '/danh-muc/dien-thoai',
    },
  },
  {
    src: '/home/banners/hero-am-thanh.webp',
    alt: 'Nghe thật hay, đeo thật chất: tai nghe, đồng hồ thông minh từ các shop uy tín',
    to: '/danh-muc/am-thanh',
    temp: {
      src: '/home/banners-temp/hero-3.webp',
      alt: 'Sennheiser Momentum True Wireless 5',
      to: '/danh-muc/am-thanh',
    },
  },
  {
    src: '/home/banners/hero-phu-kien.webp',
    alt: 'Phụ kiện chính hãng: sạc nhanh, ốp lưng, pin dự phòng từ nhiều shop',
    to: '/danh-muc/phu-kien',
    temp: {
      src: '/home/banners-temp/hero-4.webp',
      alt: 'Samsung Galaxy Z Fold8, Flip8',
      to: '/danh-muc/dien-thoai',
    },
  },
];

const SIDE_BANNERS: Banner[] = [
  {
    src: '/home/banners/side-cod.webp',
    alt: 'Nhận hàng rồi mới trả tiền: thanh toán khi nhận hàng (COD)',
    to: '/tim-kiem?sort=best_selling',
    temp: {
      src: '/home/banners-temp/side-1.webp',
      alt: 'iPhone 18 Pro',
      to: '/danh-muc/dien-thoai',
    },
  },
  {
    src: '/home/banners/side-nhieu-shop.webp',
    alt: 'Một giỏ hàng, nhiều shop: thanh toán một lần qua VNPay',
    to: '/tim-kiem?sort=newest',
    temp: {
      src: '/home/banners-temp/side-2.webp',
      alt: 'Samsung Galaxy A57, A37 5G',
      to: '/danh-muc/dien-thoai',
    },
  },
];

/** Ảnh tạm nếu có file, không thì banner HK Shop; trả thêm hàm báo lỗi tải để lùi về ảnh HK Shop */
function useBannerImage(b: Banner): [BannerImage, () => void] {
  const [failed, setFailed] = useState(false);
  return [b.temp && !failed ? b.temp : b, () => setFailed(true)];
}

/** Một slide của banner trượt: ảnh phủ kín khung, mờ dần khi chuyển */
function HeroSlide({ banner, active, first }: { banner: Banner; active: boolean; first: boolean }) {
  const [image, onError] = useBannerImage(banner);
  return (
    <Link
      to={image.to}
      aria-hidden={!active}
      tabIndex={active ? 0 : -1}
      className={cn(
        'absolute inset-0 transition-opacity duration-700 ease-out outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-inset',
        active ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <img
        src={image.src}
        alt={image.alt}
        onError={onError}
        decoding="async"
        // Banner đầu tải ngay (ảnh lớn nhất màn hình đầu), các banner sau tải nhẹ
        loading={first ? 'eager' : 'lazy'}
        fetchPriority={first ? 'high' : 'low'}
        className={cn(
          'size-full object-cover transition-transform duration-[1600ms] ease-out motion-reduce:transition-none',
          active ? 'scale-100' : 'scale-[1.03]',
        )}
      />
    </Link>
  );
}

/** Banner nhỏ ở cột phải */
function SideBanner({ banner }: { banner: Banner }) {
  const [image, onError] = useBannerImage(banner);
  return (
    <Link
      to={image.to}
      className="group overflow-hidden rounded-3xl bg-ivory-200 outline-none focus-visible:ring-2 focus-visible:ring-champagne"
    >
      <img
        src={image.src}
        alt={image.alt}
        onError={onError}
        decoding="async"
        className="aspect-[23/10] size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] lg:aspect-auto"
      />
    </Link>
  );
}

/** Nút ‹ › tròn trắng hai bên banner */
function Arrow({ dir, onClick }: { dir: 'prev' | 'next'; onClick: () => void }) {
  const Icon = dir === 'prev' ? IconChevronLeft : IconChevronRight;
  return (
    <button
      type="button"
      aria-label={dir === 'prev' ? 'Banner trước' : 'Banner sau'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 z-20 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 text-charcoal opacity-0 shadow-[0_8px_24px_-12px_rgba(15,26,61,0.35)] transition group-hover/hero:opacity-100 hover:bg-navy hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none md:flex',
        dir === 'prev' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-5 [stroke-width:2]" />
    </button>
  );
}

/** Banner trượt bên trái: ảnh mờ dần sang ảnh sau, mũi tên hiện khi rê chuột, chấm chọn banner ở dưới */
function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = SLIDES.length;
  const go = (i: number) => setIndex((i + count) % count);

  // Tự chuyển sau 6 giây; dừng khi rê chuột/focus; người dùng chọn giảm chuyển động thì không tự chuyển
  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, count]);

  // Vuốt trái/phải trên điện thoại để đổi banner
  const touchX = useRef<number | null>(null);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0]!.clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      aria-roledescription="carousel"
      aria-label="Banner nổi bật"
      className="group/hero relative aspect-[23/10] overflow-hidden rounded-3xl bg-ivory-200"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]!.clientX;
      }}
      onTouchEnd={onTouchEnd}
    >
      {SLIDES.map((s, i) => (
        <HeroSlide key={s.src} banner={s} active={i === index} first={i === 0} />
      ))}

      <Arrow dir="prev" onClick={() => go(index - 1)} />
      <Arrow dir="next" onClick={() => go(index + 1)} />

      {/* Chấm chọn banner: chấm đang xem dài ra thành vạch cam */}
      <div className="absolute inset-x-0 bottom-3 z-20 flex items-center justify-center gap-1 md:bottom-4">
        {SLIDES.map((s, i) => (
          <button
            key={s.src}
            type="button"
            aria-label={`Xem banner ${i + 1}`}
            aria-current={i === index}
            onClick={() => go(i)}
            className="flex h-5 items-center justify-center rounded-full px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-champagne"
          >
            <span
              className={cn(
                'block h-1.5 rounded-full shadow-sm transition-all duration-300',
                i === index ? 'w-5 bg-navy' : 'w-1.5 bg-white/80 hover:bg-white',
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Đầu trang chủ kiểu Shopee: banner trượt chiếm 2/3 bên trái, 2 banner nhỏ xếp chồng bên phải; tất cả chỉ là
 * ảnh có link. Banner tự chuyển sau 6 giây, dừng khi rê chuột/focus; người dùng chọn giảm chuyển động thì
 * không tự chuyển.
 */
export function HomeHero() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 md:pt-5">
      <div className="grid gap-3 lg:grid-cols-[2fr_1fr] lg:gap-4">
        <HeroCarousel />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-1 lg:grid-rows-2 lg:gap-4">
          {SIDE_BANNERS.map((b) => (
            <SideBanner key={b.src} banner={b} />
          ))}
        </div>
      </div>
    </section>
  );
}
