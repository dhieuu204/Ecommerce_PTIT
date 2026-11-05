import { IconChevronLeft, IconChevronRight, IconPhotoOff } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const noScrollbar = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * Bộ ảnh sản phẩm: ảnh lớn có nút trước/sau, dải ảnh nhỏ bên dưới (cuộn ngang được).
 * Ảnh lớn là một dải cuộn ngang có "snap" nên trên điện thoại vuốt được, kèm chấm vị trí.
 * `focusUrl` đổi (ví dụ chọn một màu có ảnh riêng) thì nhảy tới ảnh đó. `overlay`: nhãn đặt góc trên trái
 * ảnh lớn (ví dụ -%, chính hãng).
 */
export function ProductGallery({
  images,
  name,
  focusUrl,
  overlay,
}: {
  images: string[];
  name: string;
  focusUrl?: string | null;
  overlay?: React.ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const firstFocus = useRef(true);

  const goTo = useCallback(
    (i: number, smooth = true) => {
      const track = trackRef.current;
      if (!track || images.length === 0) return;
      const next = (i + images.length) % images.length;
      track.scrollTo({ left: next * track.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
      setIndex(next);
    },
    [images.length],
  );

  // Chọn màu có ảnh riêng → chuyển ảnh lớn sang ảnh đó (lần đầu nhảy ngay, không trượt)
  useEffect(() => {
    if (!focusUrl) return;
    const i = images.indexOf(focusUrl);
    if (i >= 0) goTo(i, !firstFocus.current);
    firstFocus.current = false;
  }, [focusUrl, images, goTo]);

  // Giữ ảnh nhỏ đang chọn luôn nằm trong dải ảnh nhỏ (chỉ cuộn dải, không cuộn cả trang)
  useEffect(() => {
    const strip = thumbsRef.current;
    const thumb = strip?.children[index] as HTMLElement | undefined;
    if (!strip || !thumb) return;
    const left = thumb.offsetLeft - strip.offsetLeft;
    if (
      left < strip.scrollLeft ||
      left + thumb.offsetWidth > strip.scrollLeft + strip.clientWidth
    ) {
      strip.scrollTo({
        left: left - strip.clientWidth / 2 + thumb.offsetWidth / 2,
        behavior: 'smooth',
      });
    }
  }, [index]);

  const onScroll = () => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    if (i !== index && i >= 0 && i < images.length) setIndex(i);
  };

  if (images.length === 0) {
    return (
      <div className="relative flex aspect-square w-full items-center justify-center rounded-2xl bg-page text-ink/25">
        <IconPhotoOff className="size-12" />
        {overlay}
      </div>
    );
  }

  const multiple = images.length > 1;

  return (
    <div className="min-w-0">
      <div className="group relative overflow-hidden rounded-2xl ring-1 ring-ink/[0.06]">
        <div
          ref={trackRef}
          onScroll={onScroll}
          className={cn(
            'flex aspect-square w-full snap-x snap-mandatory overflow-x-auto',
            noScrollbar,
          )}
        >
          {images.map((url, i) => (
            <div
              key={url + i}
              className="flex size-full shrink-0 snap-center items-center justify-center p-6 sm:p-10"
            >
              <img
                src={url}
                alt={`${name} - ảnh ${i + 1}`}
                loading={i === 0 ? 'eager' : 'lazy'}
                draggable={false}
                className="size-full object-contain"
              />
            </div>
          ))}
        </div>

        {overlay}
        {multiple && (
          <>
            <GalleryArrow side="left" onClick={() => goTo(index - 1)} />
            <GalleryArrow side="right" onClick={() => goTo(index + 1)} />
            <span className="absolute right-3 bottom-3 hidden rounded-lg bg-charcoal/75 px-2.5 py-1 text-xs font-medium text-white tabular-nums md:block">
              {index + 1}/{images.length}
            </span>
            {/* Chấm vị trí: chỉ trên điện thoại */}
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 md:hidden">
              {images.map((url, i) => (
                <span
                  key={url + i}
                  className={cn(
                    'h-1.5 rounded-full transition-all',
                    i === index ? 'w-5 bg-navy' : 'w-1.5 bg-ink/20',
                  )}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {multiple && (
        <div className="relative mt-3 hidden md:block">
          <div
            ref={thumbsRef}
            className={cn('flex gap-2.5 overflow-x-auto scroll-smooth p-0.5', noScrollbar)}
          >
            {images.map((url, i) => (
              <button
                key={url + i}
                type="button"
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === index}
                onClick={() => goTo(i)}
                className={cn(
                  'flex size-[4.5rem] shrink-0 items-center justify-center rounded-xl bg-card p-1.5 transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none',
                  i === index ? 'ring-2 ring-navy' : 'ring-1 ring-ink/10 hover:ring-navy/40',
                )}
              >
                <img src={url} alt="" loading="lazy" className="size-full object-contain" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GalleryArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  const Icon = side === 'left' ? IconChevronLeft : IconChevronRight;
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Ảnh trước' : 'Ảnh sau'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/95 text-charcoal opacity-0 shadow-[0_8px_24px_-12px_rgba(15,26,61,0.4)] ring-1 ring-black/5 transition group-hover:opacity-100 hover:bg-navy hover:text-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none md:flex',
        side === 'left' ? 'left-3' : 'right-3',
      )}
    >
      <Icon className="size-5 [stroke-width:2]" />
    </button>
  );
}
