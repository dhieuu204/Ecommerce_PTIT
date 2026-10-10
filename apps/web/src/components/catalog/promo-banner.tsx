import type { LucideIcon } from 'lucide-react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Banner vẽ bằng CSS (chưa có ảnh banner do admin tải lên): khung màu navy/champagne, icon lớn
 * trong các vòng tròn đồng tâm, chữ tiêu đề và nút. Không dùng ảnh ngoài.
 */

export type BannerTone = 'navy' | 'light' | 'champagne';

const TONES: Record<
  BannerTone,
  { box: string; eyebrow: string; title: string; accent: string; text: string; btn: string }
> = {
  navy: {
    box: 'bg-gradient-to-br from-navy-900 via-navy to-navy-800 text-white',
    eyebrow: 'border-champagne/50 text-champagne',
    title: 'text-white',
    accent: 'text-champagne',
    text: 'text-white/70',
    btn: 'bg-champagne text-navy hover:bg-champagne-50',
  },
  light: {
    box: 'bg-gradient-to-br from-card via-card to-champagne-50 text-ink',
    eyebrow: 'border-navy/20 text-navy',
    title: 'text-navy',
    accent: 'text-champagne-600',
    text: 'text-ink/60',
    btn: 'bg-navy text-white hover:bg-navy-800',
  },
  champagne: {
    box: 'bg-gradient-to-br from-champagne-50 via-champagne/60 to-champagne text-navy',
    eyebrow: 'border-navy/25 text-navy',
    title: 'text-navy',
    accent: 'text-navy-800',
    text: 'text-navy/70',
    btn: 'bg-navy text-white hover:bg-navy-800',
  },
};

/** Icon lớn trong các vòng tròn đồng tâm, góc phải banner */
export function BannerArt({
  icon: Icon,
  tone,
  className,
}: {
  icon: LucideIcon;
  tone: BannerTone;
  className?: string;
}) {
  const ring = tone === 'navy' ? 'border-champagne/25' : 'border-navy/10';
  const core =
    tone === 'navy'
      ? 'bg-gradient-to-br from-champagne to-champagne-600 text-navy shadow-[0_20px_60px_-10px_rgba(200,169,107,0.55)]'
      : 'bg-gradient-to-br from-navy to-navy-800 text-champagne shadow-[0_20px_50px_-12px_rgba(23,37,84,0.5)]';
  return (
    <div aria-hidden className={cn('pointer-events-none relative aspect-square', className)}>
      <div className={cn('absolute inset-0 rounded-full border', ring)} />
      <div className={cn('absolute inset-[12%] rounded-full border border-dashed', ring)} />
      <div className={cn('absolute inset-[24%] rounded-full border', ring)} />
      <div
        className={cn(
          'absolute inset-[32%] flex rotate-[-8deg] items-center justify-center rounded-[28%]',
          core,
        )}
      >
        <Icon className="size-1/2" strokeWidth={1.4} />
      </div>
      <span
        className={cn(
          'absolute top-[14%] right-[12%] size-[7%] rounded-full',
          tone === 'navy' ? 'bg-champagne' : 'bg-champagne-600',
        )}
      />
      <span
        className={cn(
          'absolute bottom-[18%] left-[8%] size-[4.5%] rounded-full',
          tone === 'navy' ? 'bg-white/60' : 'bg-navy/40',
        )}
      />
    </div>
  );
}

export interface BannerContent {
  eyebrow?: string;
  title: string;
  accent?: string;
  text?: string;
  cta: string;
  /** Đường dẫn khi bấm nút; hoặc dùng onClick */
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  tone: BannerTone;
}

/** Một banner: chữ bên trái, hình bên phải. size quyết định cỡ chữ. */
export function PromoBanner({
  banner,
  size = 'md',
  className,
}: {
  banner: BannerContent;
  size?: 'lg' | 'md' | 'sm';
  className?: string;
}) {
  const t = TONES[banner.tone];
  const button = (
    <>
      {banner.cta}
      <ArrowRight className="size-4 transition group-hover/btn:translate-x-0.5" />
    </>
  );
  const btnClass = cn(
    'group/btn inline-flex items-center gap-2 rounded-full font-semibold shadow-sm transition outline-none focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2',
    size === 'sm' ? 'h-8 px-4 text-xs' : 'h-9 px-5 text-sm md:h-10 md:px-6',
    t.btn,
  );

  return (
    <div
      className={cn(
        'relative isolate flex h-full overflow-hidden rounded-3xl border',
        banner.tone === 'light' ? 'border-ivory-200' : 'border-transparent',
        t.box,
        className,
      )}
    >
      {/* Ánh sáng nền */}
      <div
        aria-hidden
        className={cn(
          'absolute -top-1/3 -right-[15%] -z-10 aspect-square w-[70%] rounded-full blur-3xl',
          banner.tone === 'navy' ? 'bg-champagne/20' : 'bg-white/70',
        )}
      />
      <div
        className={cn(
          'relative z-10 flex flex-col justify-center [&>*]:shrink-0',
          size === 'lg'
            ? 'w-[64%] p-5 sm:p-6 md:p-10'
            : size === 'md'
              ? 'w-[62%] p-6 md:p-8'
              : 'w-[64%] p-5',
        )}
      >
        {banner.eyebrow && (
          <span
            className={cn(
              'mb-3 w-fit items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.16em] uppercase md:text-[11px]',
              size === 'lg' ? 'hidden sm:inline-flex' : 'inline-flex',
              t.eyebrow,
            )}
          >
            {banner.eyebrow}
          </span>
        )}
        <div
          className={cn(
            'leading-tight font-bold tracking-tight text-balance',
            t.title,
            size === 'lg'
              ? 'text-[1.4rem] sm:text-2xl md:text-[2.4rem]'
              : size === 'md'
                ? 'text-xl md:text-3xl'
                : 'text-lg',
          )}
        >
          {banner.title}
        </div>
        {banner.accent && (
          <div
            className={cn(
              'mt-1 font-semibold',
              t.accent,
              size === 'lg'
                ? 'text-base sm:text-lg md:text-3xl'
                : size === 'md'
                  ? 'text-base md:text-xl'
                  : 'text-sm',
            )}
          >
            {banner.accent}
          </div>
        )}
        {banner.text && (
          <p
            className={cn(
              'mt-2 line-clamp-2',
              t.text,
              size === 'sm' ? 'text-xs' : 'text-xs md:text-sm',
              size === 'lg' && 'hidden sm:block md:max-w-md md:text-base',
            )}
          >
            {banner.text}
          </p>
        )}
        <div className={size === 'lg' ? 'mt-4 md:mt-6' : size === 'md' ? 'mt-4 md:mt-5' : 'mt-3'}>
          {banner.to ? (
            <Link to={banner.to} className={btnClass}>
              {button}
            </Link>
          ) : (
            <button type="button" onClick={banner.onClick} className={btnClass}>
              {button}
            </button>
          )}
        </div>
      </div>
      <BannerArt
        icon={banner.icon}
        tone={banner.tone}
        className={cn(
          'absolute top-1/2 -translate-y-1/2',
          size === 'lg'
            ? '-right-[4%] w-[52%] md:right-[3%] md:w-[40%]'
            : size === 'md'
              ? '-right-[6%] w-[50%] md:right-[2%] md:w-[42%]'
              : '-right-[10%] w-[52%]',
        )}
      />
    </div>
  );
}

/** Banner lớn trượt tự động (6 giây/lần, dừng khi rê chuột hoặc focus), có chấm chọn và nút ‹ › */
export function BannerCarousel({
  slides,
  className,
}: {
  slides: BannerContent[];
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (paused || count < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => window.clearInterval(t);
  }, [paused, count]);

  const go = (i: number) => setIndex((i + count) % count);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Banner nổi bật"
      className={cn('group relative overflow-hidden rounded-3xl', className)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {slides.map((s, i) => (
        <div
          key={s.title}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} / ${count}`}
          aria-hidden={i !== index}
          inert={i !== index}
          className={cn(
            'absolute inset-0 transition-all duration-700 ease-out',
            i === index ? 'opacity-100' : 'pointer-events-none scale-[1.02] opacity-0',
          )}
        >
          <PromoBanner banner={s} size="lg" />
        </div>
      ))}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Banner trước"
            onClick={() => go(index - 1)}
            className="absolute top-1/2 left-3 z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/85 text-navy opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Banner sau"
            onClick={() => go(index + 1)}
            className="absolute top-1/2 right-3 z-20 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/85 text-navy opacity-0 shadow transition group-hover:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronRight className="size-5" />
          </button>
          <div className="absolute right-5 bottom-4 z-20 flex gap-1.5 md:right-auto md:bottom-5 md:left-1/2 md:-translate-x-1/2">
            {slides.map((s, i) => (
              <button
                key={s.title}
                type="button"
                aria-label={`Xem banner ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all',
                  i === index ? 'w-6 bg-champagne' : 'w-1.5 bg-white/50 hover:bg-white/80',
                  slides[index]!.tone !== 'navy' && i !== index && 'bg-navy/25 hover:bg-navy/40',
                )}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
