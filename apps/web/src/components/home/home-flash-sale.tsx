import {
  IconBoltFilled,
  IconChevronLeft,
  IconChevronRight,
  IconFlameFilled,
} from '@tabler/icons-react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useProductSearch } from '@/components/catalog/browse-query';
import { discountPercent, formatSold } from '@/components/catalog/product-card';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductCardData } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { HOME_BEST_SELLING } from './home-sections';

/*
 * Flash Sale trang chủ, chuyển từ giao diện FlashSale của web cũ của chủ đồ án (repo dhieuu204/thayvinh,
 * front-end/haha/src/components/FlashSale): khung trắng viền mảnh, ảnh chữ Flash Sale, "Kết thúc trong" có ô
 * giờ / phút / giây, hàng thẻ cuộn ngang có nút ‹ ›, thanh tiến độ chạy bằng motion (framer-motion).
 *
 * Khung giờ theo Shopee: mỗi ngày 6 khung bắt đầu lúc 0h, 9h, 12h, 15h, 18h, 21h (giờ Việt Nam); tab hiện
 * khung đang diễn ra và các khung sắp diễn ra, đồng hồ đếm "Kết thúc trong" / "Bắt đầu sau".
 *
 * Sàn CHƯA có bảng Flash Sale ở backend (giá suất, số suất theo khung): giá hiện là giá giảm shop đặt sẵn,
 * mỗi khung chỉ xoay sang nhóm sản phẩm giảm giá khác. Có tính năng Flash Sale thật thì thay `slotProducts`
 * bằng dữ liệu API, phần giao diện giữ nguyên.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Giờ Việt Nam lệch UTC +7 (không đổi giờ theo mùa) */
const VN_OFFSET_MS = 7 * HOUR_MS;
/** Giờ bắt đầu các khung Flash Sale trong ngày (giờ Việt Nam), theo lịch Shopee */
const SLOT_HOURS = [0, 9, 12, 15, 18, 21];
/** Số tab: khung đang diễn ra + các khung kế tiếp */
const TAB_COUNT = 4;
/** Số thẻ mỗi khung */
const SLOT_SIZE = 10;
/**
 * Ảnh chữ "Flash Sale" như web cũ (ảnh của trang khác, đặt trong public/home/banners-temp, KHÔNG commit,
 * xem .gitignore). Máy không có file thì hiện chữ tự dựng.
 */
const TITLE_IMAGE = '/home/banners-temp/flash-sale-title.png';

interface Slot {
  /** Số thứ tự khung tính từ mốc 1970 (khác nhau cho mọi khung, dùng làm khóa và để xoay sản phẩm) */
  key: number;
  start: number;
  end: number;
}

/** Khung chứa thời điểm `now` (mốc UTC, ms) */
function slotAt(now: number): Slot {
  const vn = now + VN_OFFSET_MS;
  const day = Math.floor(vn / DAY_MS);
  const hour = Math.floor((vn % DAY_MS) / HOUR_MS);
  let i = SLOT_HOURS.length - 1;
  while (SLOT_HOURS[i]! > hour) i--;
  const dayStart = day * DAY_MS - VN_OFFSET_MS;
  const start = dayStart + SLOT_HOURS[i]! * HOUR_MS;
  const end =
    i + 1 < SLOT_HOURS.length ? dayStart + SLOT_HOURS[i + 1]! * HOUR_MS : dayStart + DAY_MS;
  return { key: day * SLOT_HOURS.length + i, start, end };
}

/** Khung đang diễn ra và các khung kế tiếp */
function upcomingSlots(now: number): Slot[] {
  const slots = [slotAt(now)];
  while (slots.length < TAB_COUNT) slots.push(slotAt(slots[slots.length - 1]!.end));
  return slots;
}

const hhmm = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Ngày theo giờ Việt Nam để so "hôm nay / ngày mai" */
const vnDay = (t: number) => Math.floor((t + VN_OFFSET_MS) / DAY_MS);

/** Đồng hồ chạy từng giây */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

/** Một ô thời gian: số trắng trên nền than, chữ nhỏ bên dưới */
function TimeUnit({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-charcoal px-1.5 text-[15px] font-bold text-white tabular-nums">
        {value}
      </span>
      <span className="text-[9px] font-medium tracking-wide text-ink/50 uppercase">{label}</span>
    </div>
  );
}

function Colon() {
  return <span className="mb-3.5 text-[13px] font-bold text-ink/45">:</span>;
}

/** Đếm ngược tới mốc `to` */
function Countdown({ now, to, label }: { now: number; to: number; label: string }) {
  const left = Math.max(0, Math.floor((to - now) / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-semibold tracking-widest text-ink/50 uppercase">
        {label}
      </span>
      <div className="flex items-end gap-1" role="timer" aria-label={label}>
        <TimeUnit value={pad(Math.floor(left / 3600))} label="giờ" />
        <Colon />
        <TimeUnit value={pad(Math.floor((left % 3600) / 60))} label="phút" />
        <Colon />
        <TimeUnit value={pad(left % 60)} label="giây" />
      </div>
    </div>
  );
}

/** Ảnh chữ Flash Sale; không có ảnh thì chữ "FLASH ⚡ SALE" tự dựng */
function FlashSaleTitle() {
  const [failed, setFailed] = useState(false);
  if (!failed) {
    return (
      <img
        src={TITLE_IMAGE}
        alt="Flash Sale"
        onError={() => setFailed(true)}
        draggable={false}
        className="h-10 w-auto object-contain select-none"
      />
    );
  }
  return (
    <h2 className="flex items-center text-[1.625rem] leading-none font-extrabold tracking-tight uppercase italic select-none">
      <span className="bg-gradient-to-r from-header-from to-header-to bg-clip-text pr-0.5 text-transparent">
        Flash
      </span>
      <IconBoltFilled aria-hidden className="mx-0.5 size-7 text-champagne" />
      <span className="bg-gradient-to-r from-header-to to-champagne bg-clip-text pr-1 text-transparent">
        Sale
      </span>
    </h2>
  );
}

/** Tab khung giờ: giờ bắt đầu - kết thúc và trạng thái; tab đang chọn có gạch chân vàng cam trượt theo */
function SlotTab({
  slot,
  live,
  active,
  now,
  onSelect,
}: {
  slot: Slot;
  live: boolean;
  active: boolean;
  now: number;
  onSelect: () => void;
}) {
  const tomorrow = vnDay(slot.start) > vnDay(now);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={cn(
        'relative flex shrink-0 flex-col items-center px-4 py-1 transition-colors focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none md:px-5',
        active ? 'text-charcoal' : 'text-ink/50 hover:text-charcoal',
      )}
    >
      <span className="text-sm font-bold tabular-nums">
        {hhmm.format(slot.start)} - {hhmm.format(slot.end)}
      </span>
      <span className={cn('text-xs font-medium', live && 'text-navy')}>
        {live ? 'Đang diễn ra' : tomorrow ? 'Ngày mai' : 'Sắp diễn ra'}
      </span>
      {active && (
        <motion.span
          layoutId="flash-slot-underline"
          className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-champagne"
          transition={{ type: 'spring', stiffness: 500, damping: 40 }}
        />
      )}
    </button>
  );
}

/**
 * Thẻ sản phẩm Flash Sale: ô ảnh nền xám nhạt có nhãn -%, tên 2 dòng, giá cam + giá gốc gạch ngang, thanh
 * tiến độ "Đã bán" (độ dài so với món bán chạy nhất trong khung, chạy ra khi cuộn tới). Khung sắp diễn ra:
 * thanh ghi giờ mở bán.
 */
function FlashCard({
  product: p,
  fill,
  opensAt,
}: {
  product: ProductCardData;
  fill: number;
  /** Có khi khung chưa bắt đầu: "12:00" */
  opensAt?: string;
}) {
  const pct = discountPercent(p.minPrice, p.originalPrice);
  return (
    <Link
      to={`/san-pham/${p.id}`}
      className="group flex w-[180px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-black/[0.06] bg-card shadow-[0_2px_12px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_28px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none"
    >
      <div className="relative flex h-[155px] items-center justify-center bg-page p-4">
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            decoding="async"
            className="max-h-[125px] w-auto object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
          />
        )}
        {pct > 0 && (
          <span className="absolute top-2 right-2 rounded-md bg-navy px-1.5 py-0.5 text-[11px] font-bold text-white">
            -{pct}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col px-3 pt-2 pb-3">
        <p className="line-clamp-2 min-h-[2.0625rem] text-xs leading-snug font-medium text-charcoal">
          {p.name}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          <span className="text-sm font-bold text-navy">{formatMoney(p.minPrice)}</span>
          {pct > 0 && (
            <span className="text-[11px] text-ink/50 line-through">
              {formatMoney(p.originalPrice!)}
            </span>
          )}
        </div>

        {/* Thanh tiến độ: chữ nằm giữa thanh */}
        <div className="mt-auto pt-2.5">
          <div className="relative h-5 overflow-hidden rounded-full bg-mist">
            {!opensAt && p.inStock && (
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-navy-600 to-champagne"
                initial={{ width: 0 }}
                whileInView={{ width: `${Math.round(fill * 100)}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            )}
            <div className="absolute inset-0 flex items-center justify-center gap-1">
              {!opensAt && p.inStock && <IconFlameFilled className="size-[11px] text-navy" />}
              <span className="text-[10px] font-semibold text-charcoal">
                {opensAt
                  ? `Mở bán lúc ${opensAt}`
                  : p.inStock
                    ? `Đã bán ${formatSold(p.soldCount)}`
                    : 'Tạm hết hàng'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

/** Nút ‹ › tròn trắng hai bên hàng thẻ, rê chuột thì tô vàng cam */
function CarouselArrow({ left, onClick }: { left?: boolean; onClick: () => void }) {
  const Icon = left ? IconChevronLeft : IconChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={left ? 'Trước' : 'Sau'}
      className={cn(
        'absolute top-1/2 z-10 hidden size-9 -translate-y-6 items-center justify-center rounded-full border border-black/[0.08] bg-card text-charcoal shadow-md transition-all duration-200 hover:border-champagne hover:bg-champagne hover:text-white focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-90 md:flex',
        left ? '-left-4' : '-right-4',
      )}
    >
      <Icon className="size-3.5 [stroke-width:2.5]" />
    </button>
  );
}

/** Nhóm sản phẩm của một khung: xoay danh sách hàng giảm giá theo số thứ tự khung */
function slotProducts(pool: ProductCardData[], slot: Slot) {
  if (pool.length === 0) return [];
  const start = (slot.key * 3) % pool.length;
  return Array.from(
    { length: Math.min(SLOT_SIZE, pool.length) },
    (_, i) => pool[(start + i) % pool.length]!,
  );
}

export function FlashSaleSection() {
  const q = useProductSearch(HOME_BEST_SELLING);
  const now = useNow();
  const liveKey = slotAt(now).key;
  const slots = upcomingSlots(now);
  // Khung đang chọn; null = khung đang diễn ra (tự sang khung mới khi hết giờ)
  const [picked, setPicked] = useState<number | null>(null);
  const slot = slots.find((s) => s.key === picked) ?? slots[0]!;
  const live = slot.key === liveKey;

  const trackRef = useRef<HTMLDivElement>(null);
  const scroll = useCallback((dir: number) => {
    trackRef.current?.scrollBy({ left: dir * 400, behavior: 'smooth' });
  }, []);

  // Hàng giảm giá trong danh sách bán chạy, giảm nhiều trước
  const pool = (q.data?.items ?? [])
    .map((p) => ({ p, pct: discountPercent(p.minPrice, p.originalPrice) }))
    .filter((d) => d.pct > 0)
    .sort((a, b) => b.pct - a.pct)
    .map((d) => d.p);
  const products = slotProducts(pool, slot);
  const maxSold = Math.max(1, ...products.map((p) => p.soldCount));

  if (q.isError || (q.data && pool.length === 0)) return null;

  return (
    <MotionConfig reducedMotion="user">
      <section className="mx-auto max-w-7xl px-4 pt-8 md:pt-10">
        <div className="relative overflow-hidden rounded-2xl border border-black/[0.06] bg-card px-4 py-4 shadow-[0_4px_20px_rgba(0,0,0,0.05)] md:px-6">
          {/* Đầu khối: ảnh chữ | đồng hồ | các khung giờ */}
          <div className="mt-1 mb-4 flex flex-wrap items-center gap-x-5 gap-y-3">
            <FlashSaleTitle />
            <div className="h-7 w-px bg-black/[0.08]" />
            <Countdown
              now={now}
              to={live ? slot.end : slot.start}
              label={live ? 'Kết thúc trong' : 'Bắt đầu sau'}
            />
            <div
              role="tablist"
              aria-label="Khung giờ Flash Sale"
              className="-mx-4 flex w-[calc(100%+2rem)] overflow-x-auto border-b border-black/[0.06] px-4 [scrollbar-width:none] lg:mx-0 lg:ml-auto lg:w-auto lg:border-0 lg:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {slots.map((s) => (
                <SlotTab
                  key={s.key}
                  slot={s}
                  live={s.key === liveKey}
                  active={s.key === slot.key}
                  now={now}
                  onSelect={() => setPicked(s.key === liveKey ? null : s.key)}
                />
              ))}
            </div>
          </div>

          {/* Hàng thẻ cuộn ngang; đổi khung thì trượt mờ sang nhóm mới */}
          <div className="relative px-1">
            <CarouselArrow left onClick={() => scroll(-1)} />
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={slot.key}
                ref={trackRef}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="flex snap-x gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {q.isPending
                  ? Array.from({ length: 6 }, (_, i) => (
                      <Skeleton key={i} className="h-[290px] w-[180px] shrink-0 rounded-2xl" />
                    ))
                  : products.map((p) => (
                      <FlashCard
                        key={p.id}
                        product={p}
                        fill={Math.max(0.12, p.soldCount / maxSold)}
                        opensAt={live ? undefined : hhmm.format(slot.start)}
                      />
                    ))}
              </motion.div>
            </AnimatePresence>
            <CarouselArrow onClick={() => scroll(1)} />
          </div>
        </div>
      </section>
    </MotionConfig>
  );
}
