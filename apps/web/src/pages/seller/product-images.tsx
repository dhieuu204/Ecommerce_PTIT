import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Star, X } from 'lucide-react';
import { useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';
import { API, api, ApiError } from '@/lib/api';
import { IMAGE_TYPES, PRODUCT_LIMITS } from '@/lib/product-limits';
import { cn } from '@/lib/utils';

/** Lỗi tải ảnh dễ hiểu (kiểm trước ở trình duyệt, máy chủ kiểm lại theo nội dung file) */
function uploadError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'INVALID_IMAGE') return 'File không phải ảnh JPG, PNG hoặc WebP.';
    if (e.code === 'FILE_TOO_LARGE') return `Ảnh tối đa ${PRODUCT_LIMITS.imageMaxMb} MB.`;
    return e.message;
  }
  return 'Tải ảnh không thành công, bạn thử lại.';
}

/** Kiểm loại và dung lượng trước khi gửi; trả câu lỗi hoặc null */
function checkFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return `"${file.name}": chỉ nhận ảnh JPG, PNG hoặc WebP.`;
  if (file.size > PRODUCT_LIMITS.imageMaxMb * 1024 * 1024)
    return `"${file.name}": ảnh tối đa ${PRODUCT_LIMITS.imageMaxMb} MB.`;
  return null;
}

/** POST /uploads/product-image (multipart, trường `file`) → url ảnh */
export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api<{ url: string }>(`${API.market}/uploads/product-image`, {
    method: 'POST',
    formData,
  });
  return res.url;
}

interface Pending {
  id: string;
  preview: string;
}

/**
 * Bộ ảnh chung của sản phẩm: tối đa 9 ảnh, ảnh đầu là ảnh bìa. Kéo thả hoặc bấm mũi tên để đổi
 * thứ tự; nhiều ảnh tải cùng lúc, ảnh đang tải hiện vòng xoay.
 */
export function ImageGallery({
  images,
  setImages,
  error,
  onChanged,
}: {
  images: string[];
  setImages: Dispatch<SetStateAction<string[]>>;
  error?: string;
  /** Gọi khi bộ ảnh đổi (để xóa lỗi cũ) */
  onChanged?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const max = PRODUCT_LIMITS.maxImages;
  const room = max - images.length - pending.length;

  async function onFiles(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = '';
    if (!files.length) return;
    if (files.length > room) {
      toast.error(`Chỉ thêm được ${room} ảnh nữa (tối đa ${max} ảnh).`);
    }
    const accepted: File[] = [];
    for (const f of files.slice(0, Math.max(0, room))) {
      const err = checkFile(f);
      if (err) toast.error(err);
      else accepted.push(f);
    }
    await Promise.all(
      accepted.map(async (file) => {
        const item = { id: crypto.randomUUID(), preview: URL.createObjectURL(file) };
        setPending((p) => [...p, item]);
        try {
          const url = await uploadProductImage(file);
          setImages((prev) => (prev.length < max ? [...prev, url] : prev));
          onChanged?.();
        } catch (e) {
          toast.error(uploadError(e));
        } finally {
          setPending((p) => p.filter((x) => x.id !== item.id));
          URL.revokeObjectURL(item.preview);
        }
      }),
    );
  }

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length || from === to) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
    onChanged?.();
  };

  return (
    <div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {images.map((url, i) => (
          <li
            key={url}
            draggable
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(i);
            }}
            onDragLeave={() => setDragOver((v) => (v === i ? null : v))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) move(dragFrom, i);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            className={cn(
              'group relative aspect-square cursor-grab overflow-hidden rounded-xl border bg-white transition active:cursor-grabbing',
              i === 0 && 'border-champagne ring-1 ring-champagne',
              dragOver === i && dragFrom !== i && 'ring-2 ring-navy',
              dragFrom === i && 'opacity-40',
            )}
          >
            <img src={url} alt={`Ảnh ${i + 1}`} className="size-full object-contain p-1" />
            {i === 0 && (
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-navy/85 py-0.5 text-[11px] font-medium text-champagne">
                <Star className="size-3 fill-current" /> Ảnh bìa
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setImages((prev) => prev.filter((x) => x !== url));
                onChanged?.();
              }}
              className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-ink/70 text-white opacity-100 transition hover:bg-red-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
              aria-label={`Xóa ảnh ${i + 1}`}
            >
              <X className="size-3.5" />
            </button>
            <div
              className={cn(
                'absolute top-1 left-1 flex gap-1 transition sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100',
              )}
            >
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => move(i, i - 1)}
                  className="flex size-6 items-center justify-center rounded-full bg-white/90 text-navy shadow-sm ring-1 ring-border hover:bg-white"
                  aria-label={`Đưa ảnh ${i + 1} lên trước`}
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              )}
              {i < images.length - 1 && (
                <button
                  type="button"
                  onClick={() => move(i, i + 1)}
                  className="flex size-6 items-center justify-center rounded-full bg-white/90 text-navy shadow-sm ring-1 ring-border hover:bg-white"
                  aria-label={`Đưa ảnh ${i + 1} ra sau`}
                >
                  <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li
            key={p.id}
            className="relative aspect-square overflow-hidden rounded-xl border bg-white"
          >
            <img src={p.preview} alt="" className="size-full object-contain p-1 opacity-40" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-navy">
              <Loader2 className="size-5 animate-spin" /> Đang tải…
            </span>
          </li>
        ))}
        {room > 0 && (
          <li>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={cn(
                'flex aspect-square w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed bg-ivory/60 text-center text-xs text-champagne-600 transition hover:border-champagne hover:bg-champagne-50/60',
                error ? 'border-destructive/60' : 'border-champagne/50',
              )}
            >
              <ImagePlus className="size-6" />
              <span className="font-medium text-navy">Thêm ảnh</span>
              <span className="text-muted-foreground">
                ({images.length + pending.length}/{max})
              </span>
            </button>
          </li>
        )}
      </ul>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => void onFiles(e.target.files)}
      />
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          JPG, PNG hoặc WebP, tối đa {PRODUCT_LIMITS.imageMaxMb} MB mỗi ảnh. Ảnh đầu tiên là ảnh
          bìa; kéo thả hoặc bấm mũi tên để đổi thứ tự. Nên dùng ảnh nền trắng, vuông.
        </p>
      )}
    </div>
  );
}

/** Ô ảnh nhỏ cho một lựa chọn của nhóm 1 (ảnh theo màu): bấm để tải, có nút xóa */
export function ValueImageButton({
  url,
  onChange,
  label,
  invalid,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
  label: string;
  invalid?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = '';
    if (!file) return;
    const err = checkFile(file);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadProductImage(file));
    } catch (e) {
      toast.error(uploadError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative size-10 shrink-0">
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className={cn(
          'flex size-10 items-center justify-center overflow-hidden rounded-lg border bg-white text-champagne-600 transition hover:border-champagne',
          !url && 'border-dashed border-champagne/60',
          invalid && 'border-destructive',
        )}
        aria-label={url ? `Đổi ảnh của ${label}` : `Thêm ảnh cho ${label}`}
        title={url ? 'Đổi ảnh' : 'Thêm ảnh cho lựa chọn này'}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin text-navy" />
        ) : url ? (
          <img src={url} alt="" className="size-full object-contain" />
        ) : (
          <ImagePlus className="size-4" />
        )}
      </button>
      {url && !busy && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-ink/80 text-white hover:bg-red-600"
          aria-label={`Xóa ảnh của ${label}`}
        >
          <X className="size-2.5" />
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </div>
  );
}
