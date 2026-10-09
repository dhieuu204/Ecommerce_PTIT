import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Các số trang cần hiện: 1 … 4 5 6 … 12 */
function pageList(page: number, last: number): Array<number | '…'> {
  const set = new Set([1, last, page - 1, page, page + 1].filter((p) => p >= 1 && p <= last));
  const sorted = [...set].sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Thanh phân trang dưới bảng: "Hiển thị 1–20 / 128" + nút số trang */
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const btn =
    'inline-flex size-8 items-center justify-center rounded-lg text-sm transition disabled:pointer-events-none disabled:opacity-40';
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row',
        className,
      )}
    >
      <span>
        Hiển thị{' '}
        <b className="font-medium text-ink">
          {from}–{to}
        </b>{' '}
        / {total.toLocaleString('vi-VN')}
      </span>
      {last > 1 && (
        <nav className="flex items-center gap-1" aria-label="Phân trang">
          <button
            type="button"
            className={cn(btn, 'hover:bg-ivory-200')}
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
            aria-label="Trang trước"
          >
            <ChevronLeft className="size-4" />
          </button>
          {pageList(page, last).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? 'page' : undefined}
                className={cn(
                  btn,
                  p === page ? 'bg-navy font-semibold text-white' : 'text-ink hover:bg-ivory-200',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className={cn(btn, 'hover:bg-ivory-200')}
            disabled={page >= last}
            onClick={() => onChange(page + 1)}
            aria-label="Trang sau"
          >
            <ChevronRight className="size-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
