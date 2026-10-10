import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const noScrollbar = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

/**
 * Bộ ảnh sản phẩm: ảnh lớn có nút trước/sau, dải ảnh nhỏ bên dưới (cuộn ngang được).
 * Ảnh lớn là một dải cuộn ngang có "snap" nên trên điện thoại vuốt được, kèm chấm vị trí.
 * `focusUrl` đổi (ví dụ chọn một màu có ảnh riêng) thì nhảy tới ảnh đó.
 */
export function ProductGallery({
  images,
  name,
  focusUrl,
}: {
  images: string[];
  name: string;
  focusUrl?: string | null;
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
      <div className="flex aspect-square w-full items-center justify-center rounded-3xl border border-ivory-200 bg-card text-ink/25">
        <ImageOff className="size-12" />
      </div>
    );
  }

  const multiple = images.length > 1;

  return (
    <div className="min-w-0">
      <div className="group relative overflow-hidden rounded-3xl border border-ivory-200 bg-card">
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

        {multiple && (
          <>
            <GalleryArrow side="left" onClick={() => goTo(index - 1)} />
            <GalleryArrow side="right" onClick={() => goTo(index + 1)} />
            <span className="absolute right-4 top-4 hidden rounded-full bg-ivory/90 px-2.5 py-1 text-xs font-medium text-ink/60 tabular-nums md:block">
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
        <div className="relative mt-4 hidden md:block">
          <div
            ref={thumbsRef}
            className={cn('flex gap-3 overflow-x-auto scroll-smooth pb-1', noScrollbar)}
          >
            {images.map((url, i) => (
              <button
                key={url + i}
                type="button"
                aria-label={`Xem ảnh ${i + 1}`}
                onClick={() => goTo(i)}
                className={cn(
                  'flex size-20 shrink-0 items-center justify-center rounded-2xl border-2 bg-card p-1.5 transition lg:size-[5.5rem]',
                  i === index
                    ? 'border-champagne shadow-[0_6px_16px_-8px_rgba(200,169,107,0.8)]'
                    : 'border-ivory-200 opacity-75 hover:border-champagne/50 hover:opacity-100',
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
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      aria-label={side === 'left' ? 'Ảnh trước' : 'Ảnh sau'}
      onClick={onClick}
      className={cn(
        'absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full border border-champagne/60 bg-card/95 text-champagne-600 shadow-sm transition hover:bg-navy hover:text-champagne md:flex',
        side === 'left' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}
