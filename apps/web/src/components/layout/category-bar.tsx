import {
  IconChevronDown,
  IconChevronRight,
  IconLayoutGrid,
  IconList,
  IconPhotoOff,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useProductSearch } from '@/components/catalog/browse-query';
import { CategoryIcon } from '@/components/catalog/category-icon';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { findCategory, useCategories } from '@/hooks/use-catalog';
import type { CategoryNode } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Danh mục đang xem (trang /danh-muc/:slug): cấp 1 để tô sáng trên thanh, cấp 2 trong ngăn kéo */
function useActiveCategory(tree: CategoryNode[] | undefined) {
  const { pathname } = useLocation();
  const m = /^\/danh-muc\/([^/]+)/.exec(pathname);
  const found = m ? findCategory(tree, decodeURIComponent(m[1]!)) : null;
  return { activeId: found?.parent.id ?? null, activeChildId: found?.child?.id ?? null };
}

// ----- Mega menu (máy tính) -----

/** Bóng chung của hai khung mega menu: mềm, lan rộng, không viền */
const MEGA_SURFACE = 'rounded-xl bg-card shadow-[0_20px_50px_-24px_rgba(15,26,61,0.28)]';

/** Tên gọn trong mega menu: bỏ chữ loại hàng ở đầu ("Điện thoại iPhone 17" → "iPhone 17") */
function shortName(name: string): string {
  return name.replace(/^(Điện thoại|Máy tính bảng|Laptop|Đồng hồ thông minh)\s+/i, '');
}

/**
 * Một cột của khung phải: tên danh mục con in đậm, bên dưới các sản phẩm bán chạy nhất của nó
 * (như cột "iPhone / iPhone 17 Series…" trên onewaymobile.vn). Chỉ tải khi mega menu mở.
 */
function MegaColumn({ category }: { category: CategoryNode }) {
  const q = useProductSearch({ categoryId: category.id, sort: 'best_selling', pageSize: 6 });
  const items = q.data?.items ?? [];
  return (
    <div className="min-w-0">
      <Link
        to={`/danh-muc/${category.slug}`}
        className="block truncate text-[15px] font-bold text-ink outline-none transition-colors hover:text-navy focus-visible:text-navy 2xl:text-base"
      >
        {category.name}
      </Link>
      <ul className="mt-3 space-y-0.5">
        {q.isPending
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={i} className="py-2">
                <Skeleton className="h-4 w-3/4" />
              </li>
            ))
          : items.map((p) => (
              <li key={p.id}>
                <Link
                  to={`/san-pham/${p.id}`}
                  title={p.name}
                  className="block truncate py-1.5 text-[13px] font-medium text-ink/75 outline-none transition-colors hover:text-navy focus-visible:text-navy 2xl:text-sm"
                >
                  {shortName(p.name)}
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}

/**
 * Hàng ô quảng cáo cuối khung phải: 3 sản phẩm bán chạy nhất của danh mục, mỗi ô nền nhạt khác nhau có
 * tên, giá, nút "Mua ngay" và ảnh lớn bên phải (chưa có ảnh banner riêng do admin đặt).
 */
function MegaPromos({ category }: { category: CategoryNode }) {
  const q = useProductSearch({ categoryId: category.id, sort: 'best_selling', pageSize: 3 });
  const tones = ['bg-ivory-200', 'bg-champagne-50', 'bg-mist'];
  if (!q.isPending && (q.data?.items.length ?? 0) === 0) return null;
  return (
    <div className="mt-8 grid grid-cols-3 gap-3">
      {q.isPending
        ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)
        : q.data!.items.map((p, i) => (
            <Link
              key={p.id}
              to={`/san-pham/${p.id}`}
              className={cn(
                'group relative isolate flex h-40 flex-col justify-center overflow-hidden rounded-lg px-5 outline-none focus-visible:ring-2 focus-visible:ring-champagne',
                tones[i % tones.length],
              )}
            >
              <span className="line-clamp-2 max-w-[58%] text-base leading-snug font-bold text-charcoal">
                {shortName(p.name)}
              </span>
              <span className="mt-1 text-sm font-semibold text-navy">
                {formatMoney(p.minPrice)}
              </span>
              <span className="mt-3 w-fit rounded-md bg-charcoal px-3 py-1 text-xs font-semibold text-white transition-colors group-hover:bg-navy">
                Mua ngay
              </span>
              {p.image ? (
                <img
                  src={p.image}
                  alt=""
                  loading="lazy"
                  className="absolute top-1/2 right-2 -z-10 h-[88%] -translate-y-1/2 object-contain mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <IconPhotoOff className="absolute right-6 size-10 text-ink/20" />
              )}
            </Link>
          ))}
    </div>
  );
}

/**
 * Khung phải của mega menu: các danh mục con thành cột (tiêu đề đậm, sản phẩm bán chạy bên dưới), cuối là
 * hàng ô quảng cáo. Danh mục không có danh mục con thì cột duy nhất là chính nó.
 */
function CategoryPanel({ category }: { category: CategoryNode }) {
  const columns = category.children?.length ? category.children : [category];
  return (
    <div className="flex h-full flex-col px-10 pt-8 pb-9">
      <div className="grid grid-cols-4 gap-x-10 gap-y-8 xl:grid-cols-5">
        {columns.slice(0, 10).map((c) => (
          <MegaColumn key={c.id} category={c} />
        ))}
      </div>
      <MegaPromos category={category} />
    </div>
  );
}

/**
 * Mega menu hai khung (theo onewaymobile.vn): cột trái danh sách danh mục cấp 1 (icon, tên, ›); rê chuột
 * vào mục nào thì mục đó chuyển cam và khung phải hiện danh mục đó.
 */
function MegaMenu({
  tree,
  selectedId,
  onSelect,
}: {
  tree: CategoryNode[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const selected = tree.find((c) => c.id === selectedId) ?? tree[0];
  return (
    <div className="grid grid-cols-[18.5rem_1fr] items-start gap-1.5">
      <ul className={cn(MEGA_SURFACE, 'py-3')}>
        {tree.map((cat) => {
          const on = cat.id === selected?.id;
          return (
            <li key={cat.id}>
              <Link
                to={`/danh-muc/${cat.slug}`}
                onMouseEnter={() => onSelect(cat.id)}
                onFocus={() => onSelect(cat.id)}
                className={cn(
                  'flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium outline-none transition-colors 2xl:text-sm',
                  on ? 'text-navy' : 'text-ink hover:text-navy',
                )}
              >
                <CategoryIcon icon={cat.icon} className="size-5" />
                <span className="flex-1 truncate">{cat.name}</span>
                <IconChevronRight
                  className={cn(
                    'size-4 [stroke-width:1.75] transition-transform',
                    on ? 'translate-x-0.5 text-navy' : 'text-ink/50',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
      <div className={cn(MEGA_SURFACE, 'min-h-[30rem]')}>
        {selected && <CategoryPanel key={selected.id} category={selected} />}
      </div>
    </div>
  );
}

/**
 * Thanh danh mục máy tính (theo onewaymobile.vn): nền trắng, nút ☰ tròn cam nhạt + danh mục cấp 1 có icon
 * nét mảnh trải đều; dính đầu trang khi cuộn.
 * Rê chuột / focus vào ☰ hoặc một mục thì mở mega menu.
 */
function DesktopBar({ tree, activeId }: { tree: CategoryNode[]; activeId: string | null }) {
  /** null = đóng; còn lại = id danh mục đang hiện ở khung phải */
  const [openId, setOpenId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const { pathname, search } = useLocation();

  // Chuyển trang thì đóng menu
  useEffect(() => setOpenId(null), [pathname, search]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  const open = (id: string) => {
    window.clearTimeout(closeTimer.current);
    setOpenId(id);
  };
  const scheduleClose = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenId(null), 150);
  };
  const defaultId = activeId ?? tree[0]?.id ?? '';

  /** ↓ vào menu, Esc đóng menu */
  const onTriggerKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      open(id);
      requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('a')?.focus());
    } else if (e.key === 'Escape') {
      setOpenId(null);
    }
  };

  return (
    <div
      className="sticky top-0 z-40 hidden border-b border-black/[0.06] bg-card md:block"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenId(null);
      }}
    >
      {/* Vùng rê chuột chỉ gồm khung nội dung (thanh + mega menu), không gồm lề trống hai bên màn rộng */}
      <div
        className="relative mx-auto max-w-7xl px-4"
        onMouseLeave={scheduleClose}
        onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      >
        <div className="flex h-14 items-center gap-2">
          <button
            type="button"
            aria-expanded={openId !== null}
            aria-controls="mega-menu"
            aria-label="Tất cả danh mục"
            onMouseEnter={() => open(defaultId)}
            onFocus={() => open(defaultId)}
            onClick={() => (openId ? setOpenId(null) : open(defaultId))}
            onKeyDown={(e) => onTriggerKey(e, defaultId)}
            className={cn(
              'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-champagne-50 text-navy outline-none transition-colors focus-visible:ring-2 focus-visible:ring-champagne',
              openId ? 'bg-champagne/25' : 'hover:bg-champagne/20',
            )}
          >
            <IconList className="size-6 [stroke-width:1.6]" />
          </button>
          <ul className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] lg:justify-between [&::-webkit-scrollbar]:hidden">
            {tree.map((cat) => {
              const active = cat.id === activeId;
              const isOpen = cat.id === openId;
              return (
                <li key={cat.id} className="shrink-0">
                  <Link
                    to={`/danh-muc/${cat.slug}`}
                    aria-current={active ? 'page' : undefined}
                    aria-expanded={isOpen}
                    aria-controls="mega-menu"
                    onMouseEnter={() => open(cat.id)}
                    onFocus={() => open(cat.id)}
                    onKeyDown={(e) => onTriggerKey(e, cat.id)}
                    className={cn(
                      'relative flex h-14 items-center gap-1.5 px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-colors focus-visible:text-navy xl:px-2.5 2xl:text-sm',
                      active || isOpen ? 'text-navy' : 'text-ink hover:text-navy',
                    )}
                  >
                    <CategoryIcon icon={cat.icon} className="size-5" />
                    {cat.name}
                    <span
                      aria-hidden
                      className={cn(
                        'absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-navy transition-opacity',
                        active ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {openId && (
          <div
            id="mega-menu"
            ref={panelRef}
            className="absolute inset-x-4 top-full z-30 pt-1.5 animate-in fade-in-0 slide-in-from-top-1 duration-150"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpenId(null);
            }}
          >
            <MegaMenu tree={tree} selectedId={openId} onSelect={open} />
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Điện thoại: hàng icon cuộn ngang + ngăn kéo ☰ -----

function MobileDrawer({
  tree,
  activeId,
  activeChildId,
}: {
  tree: CategoryNode[];
  activeId: string | null;
  activeChildId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(activeId);
  const { pathname, search } = useLocation();
  useEffect(() => setOpen(false), [pathname, search]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Tất cả danh mục"
        className="flex w-16 shrink-0 flex-col items-center gap-1 text-[11px] font-medium text-navy outline-none"
      >
        <span className="flex size-10 items-center justify-center rounded-2xl bg-navy text-white">
          <IconList className="size-5" />
        </span>
        Tất cả
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[85%] gap-0 overflow-y-auto bg-card p-0 [&>button:last-child]:text-white [&>button:last-child]:opacity-90"
      >
        <SheetHeader className="border-b border-ivory-200 bg-navy p-5 text-white">
          <SheetTitle className="flex items-center gap-2 text-white">
            <IconLayoutGrid className="size-5 text-white" /> Danh mục sản phẩm
          </SheetTitle>
          <SheetDescription className="text-white/60">
            Chọn một danh mục để xem hàng đang bán.
          </SheetDescription>
        </SheetHeader>
        <ul className="divide-y divide-ivory-200 px-2 py-2">
          {tree.map((cat) => {
            const isOpen = expanded === cat.id;
            return (
              <li key={cat.id}>
                <div className="flex items-center">
                  <Link
                    to={`/danh-muc/${cat.slug}`}
                    className={cn(
                      'flex flex-1 items-center gap-3 rounded-lg px-3 py-3 text-[15px] font-medium',
                      cat.id === activeId ? 'font-semibold text-navy' : 'text-ink',
                    )}
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-mist text-ink/80">
                      <CategoryIcon icon={cat.icon} className="size-[18px]" />
                    </span>
                    {cat.name}
                  </Link>
                  {(cat.children?.length ?? 0) > 0 && (
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={`${isOpen ? 'Thu gọn' : 'Mở'} ${cat.name}`}
                      onClick={() => setExpanded(isOpen ? null : cat.id)}
                      className="flex size-10 items-center justify-center rounded-lg text-ink/50 hover:bg-ivory"
                    >
                      <IconChevronDown
                        className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
                      />
                    </button>
                  )}
                </div>
                {isOpen && (
                  <ul className="mb-2 ml-[3.75rem] space-y-0.5 border-l border-mist-200 pl-3">
                    {cat.children!.map((c) => (
                      <li key={c.id}>
                        <Link
                          to={`/danh-muc/${c.slug}`}
                          aria-current={c.id === activeChildId ? 'page' : undefined}
                          className={cn(
                            'block rounded-md px-2 py-2 text-sm hover:text-navy',
                            c.id === activeChildId ? 'font-semibold text-navy' : 'text-ink/75',
                          )}
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function MobileBar({
  tree,
  activeId,
  activeChildId,
}: {
  tree: CategoryNode[];
  activeId: string | null;
  activeChildId: string | null;
}) {
  return (
    <div className="border-b border-ivory-200 bg-card md:hidden">
      <div className="flex gap-1 overflow-x-auto px-2 py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <MobileDrawer tree={tree} activeId={activeId} activeChildId={activeChildId} />
        {tree.map((cat) => {
          const active = cat.id === activeId;
          return (
            <Link
              key={cat.id}
              to={`/danh-muc/${cat.slug}`}
              aria-current={active ? 'page' : undefined}
              className="flex w-[4.5rem] shrink-0 flex-col items-center gap-1 text-center"
            >
              <span
                className={cn(
                  'flex size-10 items-center justify-center rounded-2xl transition',
                  active ? 'bg-navy text-white' : 'bg-mist text-ink',
                )}
              >
                <CategoryIcon icon={cat.icon} className="size-[22px]" />
              </span>
              <span
                className={cn(
                  'line-clamp-2 text-[11px] leading-tight',
                  active ? 'font-semibold text-navy' : 'font-medium text-ink',
                )}
              >
                {cat.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** Thanh danh mục dưới header khu mua hàng (CAT-01, CAT-04) */
export function CategoryBar() {
  const { data, isPending } = useCategories();
  const { activeId, activeChildId } = useActiveCategory(data);

  if (isPending) {
    return (
      <div className="border-b border-ivory-200 bg-card">
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center gap-4 overflow-hidden px-4 md:h-[60px]">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-24 shrink-0" />
          ))}
        </div>
      </div>
    );
  }
  // Lỗi tải danh mục: ẩn thanh, các trang vẫn dùng được
  if (!data?.length) return null;

  return (
    <>
      <DesktopBar tree={data} activeId={activeId} />
      <MobileBar tree={data} activeId={activeId} activeChildId={activeChildId} />
    </>
  );
}
