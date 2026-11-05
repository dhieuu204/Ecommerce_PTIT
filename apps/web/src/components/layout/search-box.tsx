import { IconArrowRight, IconPhotoOff, IconSearch } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useProductSearch } from '@/components/catalog/browse-query';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { useCategories } from '@/hooks/use-catalog';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Gõ từ chừng này ký tự thì gợi ý sản phẩm */
const MIN_CHARS = 2;
/** Chờ ngừng gõ chừng này mili giây mới gọi API, để không gọi mỗi phím */
const DEBOUNCE_MS = 250;
const SUGGEST_COUNT = 5;

/**
 * Ô tìm kiếm trên header: trắng bo góc, nút kính lúp cam. Gõ từ 2 ký tự thì hiện tối đa 5 sản phẩm khớp
 * (ảnh, tên, giá, shop) ngay bên dưới; ô trống thì gợi ý danh mục. Mũi tên lên/xuống chọn, Enter mở sản
 * phẩm đang chọn (không chọn thì sang trang kết quả /tim-kiem?q=...), Esc đóng. Ở trang tìm kiếm ô giữ
 * từ khóa đang tìm.
 */
export function SearchBox({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const current = pathname === '/tim-kiem' ? (params.get('q') ?? '') : '';
  // key: đổi từ khóa trên đường dẫn (bấm quay lại) thì ô tìm hiện đúng từ khóa đó
  return <SearchBoxInner key={current} initial={current} className={className} />;
}

function SearchBoxInner({ initial, className }: { initial: string; className?: string }) {
  const navigate = useNavigate();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initial);
  const [debounced, setDebounced] = useState(initial.trim());
  const [open, setOpen] = useState(false);
  /** Gợi ý đang chọn bằng bàn phím; -1 = chưa chọn */
  const [active, setActive] = useState(-1);
  const { pathname } = useLocation();

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [value]);
  // Chuyển trang thì đóng gợi ý
  useEffect(() => setOpen(false), [pathname]);

  const typing = debounced.length >= MIN_CHARS;
  const results = useProductSearch(
    { q: debounced, sort: 'relevance', pageSize: SUGGEST_COUNT },
    open && typing,
  );
  const items = typing ? (results.data?.items ?? []) : [];
  const categories = useCategories();
  const showPanel = open && (typing || (categories.data?.length ?? 0) > 0);

  const go = (to: string) => {
    setOpen(false);
    inputRef.current?.blur();
    navigate(to);
  };
  const submit = () => {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    go(`/tim-kiem?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0 && items[active]) {
      e.preventDefault();
      go(`/san-pham/${items[active].id}`);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  };

  return (
    <div
      className={cn('relative', className)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <form
        role="search"
        className="group flex h-10 w-full items-center rounded-lg bg-card pr-1 pl-4 shadow-[0_6px_20px_-12px_rgba(0,0,0,0.45)] transition focus-within:ring-2 focus-within:ring-white/70 md:h-[42px]"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          maxLength={100}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Tìm sản phẩm"
          placeholder="Bạn cần tìm gì?"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/45 [&::-webkit-search-cancel-button]:hidden"
        />
        <button
          type="submit"
          aria-label="Tìm kiếm"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-navy text-white transition hover:bg-navy-900 active:scale-95 md:size-[34px]"
        >
          <IconSearch className="size-[18px] [stroke-width:2]" />
        </button>
      </form>

      {showPanel && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl bg-card text-ink shadow-[0_24px_48px_-16px_rgba(15,26,61,0.35)] ring-1 ring-black/5 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          {typing ? (
            <>
              <ul id={listId} role="listbox" aria-label="Gợi ý sản phẩm" className="py-2">
                {results.isPending && items.length === 0 ? (
                  Array.from({ length: 3 }, (_, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2">
                      <span className="size-12 shrink-0 animate-pulse rounded-lg bg-mist" />
                      <span className="flex-1 space-y-1.5">
                        <span className="block h-3.5 w-3/4 animate-pulse rounded bg-mist" />
                        <span className="block h-3 w-1/3 animate-pulse rounded bg-mist" />
                      </span>
                    </li>
                  ))
                ) : items.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-ink/55">
                    Không thấy sản phẩm nào khớp “{debounced}”.
                  </li>
                ) : (
                  items.map((p, i) => (
                    <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                      <Link
                        to={`/san-pham/${p.id}`}
                        onClick={() => setOpen(false)}
                        onMouseEnter={() => setActive(i)}
                        className={cn(
                          'flex items-center gap-3 px-4 py-2 transition-colors',
                          i === active ? 'bg-ivory' : 'hover:bg-ivory',
                        )}
                      >
                        <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card ring-1 ring-ivory-200">
                          {p.image ? (
                            <img src={p.image} alt="" className="size-full object-contain p-0.5" />
                          ) : (
                            <IconPhotoOff className="size-5 text-ink/30" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-charcoal">
                            {p.name}
                          </span>
                          <span className="block truncate text-xs text-ink/55">{p.shop.name}</span>
                        </span>
                        <span className="shrink-0 text-sm font-bold text-navy">
                          {formatMoney(p.minPrice)}
                        </span>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                onClick={submit}
                className="group flex w-full items-center justify-between gap-2 bg-ivory px-4 py-3 text-left text-sm font-semibold text-navy transition-colors hover:bg-champagne-50"
              >
                <span className="truncate">Xem tất cả kết quả cho “{value.trim()}”</span>
                <IconArrowRight className="size-4 shrink-0 [stroke-width:2] transition group-hover:translate-x-0.5" />
              </button>
            </>
          ) : (
            <div className="p-4">
              <p className="mb-3 text-xs font-semibold text-ink/55">Tìm theo danh mục</p>
              <div className="flex flex-wrap gap-2">
                {categories.data?.slice(0, 9).map((c) => (
                  <Link
                    key={c.id}
                    to={`/danh-muc/${c.slug}`}
                    onClick={() => setOpen(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ivory px-3 py-1.5 text-[13px] font-medium text-charcoal transition-colors hover:bg-navy hover:text-white"
                  >
                    <CategoryIcon icon={c.icon} className="size-4" />
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
