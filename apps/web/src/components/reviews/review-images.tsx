import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Ảnh nhỏ của một đánh giá; bấm vào thì phóng to, chuyển qua lại giữa các ảnh */
export function ReviewImages({ images, className }: { images: string[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  if (images.length === 0) return null;
  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {images.map((url, i) => (
          <button
            key={url}
            type="button"
            onClick={() => setOpen(i)}
            className="group size-16 overflow-hidden rounded-lg border border-ivory-200 bg-ivory outline-none focus-visible:ring-2 focus-visible:ring-champagne sm:size-20"
            aria-label={`Xem ảnh ${i + 1}`}
          >
            <img
              src={url}
              alt=""
              loading="lazy"
              className="size-full object-cover transition duration-300 group-hover:scale-105"
            />
          </button>
        ))}
      </div>
      <ImageViewer images={images} index={open} onIndex={setOpen} />
    </>
  );
}

/** Hộp xem ảnh lớn: nút trước/sau, phím mũi tên, hàng ảnh nhỏ bên dưới */
function ImageViewer({
  images,
  index,
  onIndex,
}: {
  images: string[];
  index: number | null;
  onIndex: (i: number | null) => void;
}) {
  const many = images.length > 1;
  const go = (step: number) =>
    index !== null && onIndex((index + step + images.length) % images.length);
  return (
    <Dialog open={index !== null} onOpenChange={(o) => !o && onIndex(null)}>
      <DialogContent
        className="max-w-[calc(100%-1rem)] gap-3 rounded-2xl border-0 bg-navy-900 p-3 text-white sm:max-w-3xl sm:p-4 [&>button]:text-white"
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(1);
          if (e.key === 'ArrowLeft') go(-1);
        }}
      >
        <DialogTitle className="sr-only">Ảnh đánh giá</DialogTitle>
        <DialogDescription className="sr-only">
          Ảnh {index !== null ? index + 1 : 0} / {images.length}
        </DialogDescription>
        {index !== null && (
          <div className="relative flex h-[min(70vh,36rem)] items-center justify-center">
            <img
              src={images[index]}
              alt={`Ảnh ${index + 1}`}
              className="max-h-full max-w-full rounded-lg object-contain"
            />
            {many && (
              <>
                <button
                  type="button"
                  onClick={() => go(-1)}
                  aria-label="Ảnh trước"
                  className="absolute left-1 flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
                >
                  <ChevronLeft className="size-5" />
                </button>
                <button
                  type="button"
                  onClick={() => go(1)}
                  aria-label="Ảnh sau"
                  className="absolute right-1 flex size-10 items-center justify-center rounded-full bg-white/15 backdrop-blur transition hover:bg-white/25"
                >
                  <ChevronRight className="size-5" />
                </button>
                <span className="absolute bottom-2 rounded-full bg-black/50 px-2.5 py-0.5 text-xs">
                  {index + 1} / {images.length}
                </span>
              </>
            )}
          </div>
        )}
        {many && (
          <div className="flex justify-center gap-2 overflow-x-auto">
            {images.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => onIndex(i)}
                aria-label={`Ảnh ${i + 1}`}
                className={cn(
                  'size-12 shrink-0 overflow-hidden rounded-md border-2 transition',
                  i === index
                    ? 'border-champagne'
                    : 'border-transparent opacity-60 hover:opacity-100',
                )}
              >
                <img src={url} alt="" className="size-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
