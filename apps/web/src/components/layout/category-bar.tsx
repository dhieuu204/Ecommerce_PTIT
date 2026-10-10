import { ArrowRight, ChevronDown, ChevronRight, ImageOff, LayoutGrid, Menu } from 'lucide-react';
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

/** Bán chạy trong danh mục: 4 thẻ nhỏ trong mega menu, chỉ tải khi mở */
function MegaBestSellers({ category }: { category: CategoryNode }) {
  const q = useProductSearch({ categoryId: category.id, sort: 'best_selling', pageSize: 4 });
  const items = q.data?.items ?? [];
  if (!q.isPending && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl bg-ivory text-sm text-ink/50">
        Danh mục này chưa có sản phẩm.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-4 gap-3">
      {q.isPending
        ? Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-xl border border-ivory-200 p-2.5">
              <Skeleton className="aspect-square w-full rounded-lg" />
              <Skeleton className="mt-2 h-3.5 w-11/12" />
              <Skeleton className="mt-1.5 h-3.5 w-1/2" />
            </div>
          ))
        : items.map((p) => (
            <Link
              key={p.id}
              to={`/san-pham/${p.id}`}
              className="group rounded-xl border border-ivory-200 bg-card p-2.5 transition hover:border-champagne/70 hover:shadow-md focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none"
            >
              <div className="aspect-square overflow-hidden rounded-lg bg-white">
                {p.image ? (
                  <img
                    src={p.image}
                    alt=""
                    loading="lazy"
                    className="size-full object-contain transition duration-300 group-hover:scale-105"
                  />
                ) : (
                  <span className="flex size-full items-center justify-center text-ink/25">
                    <ImageOff className="size-6" />
                  </span>
                )}
              </div>
              <div className="mt-2 line-clamp-2 min-h-8 text-xs leading-4 font-medium text-ink group-hover:text-navy">
                {p.name}
              </div>
              <div className="mt-1 text-[13px] font-bold text-navy">{formatMoney(p.minPrice)}</div>
            </Link>
          ))}
    </div>
  );
}

function CategoryPanel({ category }: { category: CategoryNode }) {
  return (
    <div className="grid grid-cols-[15rem_1fr] gap-6 p-6">
      <div className="flex flex-col">
        <Link
          to={`/danh-muc/${category.slug}`}
          className="flex items-center gap-2.5 rounded-xl text-base font-semibold text-navy outline-none hover:text-champagne-600 focus-visible:ring-2 focus-visible:ring-champagne"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
            <CategoryIcon icon={category.icon} className="size-[18px]" />
          </span>
          {category.name}
        </Link>
        <ul className="mt-4 space-y-0.5">
          {(category.children ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to={`/danh-muc/${c.slug}`}
                className="group flex items-center justify-between rounded-lg px-3 py-2 text-sm text-ink/80 outline-none transition hover:bg-ivory hover:text-navy focus-visible:bg-ivory focus-visible:text-navy"
              >
                {c.name}
                <ChevronRight className="size-3.5 text-ink/30 transition group-hover:translate-x-0.5 group-hover:text-champagne-600" />
              </Link>
            </li>
          ))}
        </ul>
        <Link
          to={`/danh-muc/${category.slug}`}
          className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-medium text-champagne-600 outline-none hover:text-navy focus-visible:underline"
        >
          Xem tất cả {category.name.toLowerCase()} <ArrowRight className="size-3.5" />
        </Link>
      </div>
      <div className="border-l border-ivory-200 pl-6">
        <div className="mb-3 text-xs font-semibold tracking-[0.14em] text-champagne-600 uppercase">
          Bán chạy trong {category.name}
        </div>
        <MegaBestSellers category={category} />
      </div>
    </div>
  );
}

function AllCategoriesPanel({ tree }: { tree: CategoryNode[] }) {
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-7 p-6 lg:grid-cols-5">
      {tree.map((cat) => (
        <div key={cat.id}>
          <Link
            to={`/danh-muc/${cat.slug}`}
            className="flex items-center gap-2 text-sm font-semibold text-navy outline-none hover:text-champagne-600 focus-visible:ring-2 focus-visible:ring-champagne"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
              <CategoryIcon icon={cat.icon} className="size-4" />
            </span>
            {cat.name}
          </Link>
          <ul className="mt-2 space-y-0.5 pl-10">
            {(cat.children ?? []).map((c) => (
              <li key={c.id}>
                <Link
                  to={`/danh-muc/${c.slug}`}
                  className="block rounded py-1 text-[13px] text-ink/65 outline-none transition hover:text-navy focus-visible:text-navy focus-visible:underline"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Thanh danh mục máy tính: nút "Danh mục" + danh mục cấp 1, mở mega menu khi rê chuột/focus */
function DesktopBar({ tree, activeId }: { tree: CategoryNode[]; activeId: string | null }) {
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
    closeTimer.current = window.setTimeout(() => setOpenId(null), 120);
  };

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

  const openCat = openId && openId !== 'all' ? tree.find((c) => c.id === openId) : undefined;

  return (
    <div
      className="relative hidden border-b border-ivory-200 bg-card md:block"
      onMouseLeave={scheduleClose}
      onMouseEnter={() => window.clearTimeout(closeTimer.current)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpenId(null);
      }}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4">
        <button
          type="button"
          aria-expanded={openId === 'all'}
          aria-controls="mega-menu"
          aria-label="Tất cả danh mục"
          onMouseEnter={() => open('all')}
          onFocus={() => open('all')}
          onClick={() => open('all')}
          onKeyDown={(e) => onTriggerKey(e, 'all')}
          className={cn(
            'flex h-10 shrink-0 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold outline-none transition focus-visible:ring-2 focus-visible:ring-champagne',
            openId === 'all'
              ? 'bg-navy text-white'
              : 'bg-champagne-50 text-navy hover:bg-navy hover:text-white',
          )}
        >
          <Menu className="size-[18px]" />
          <span className="hidden lg:inline">Danh mục</span>
        </button>
        <ul className="flex min-w-0 flex-1 items-center overflow-x-auto [scrollbar-width:none] xl:justify-between [&::-webkit-scrollbar]:hidden">
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
                    'relative flex h-14 items-center gap-2 px-3 text-sm font-medium whitespace-nowrap outline-none transition focus-visible:bg-ivory',
                    active || isOpen ? 'text-champagne-600' : 'text-ink/80 hover:text-navy',
                  )}
                >
                  <CategoryIcon icon={cat.icon} className="size-[18px]" strokeWidth={1.75} />
                  {cat.name}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-champagne transition-opacity',
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
          className="absolute inset-x-0 top-full z-30 animate-in fade-in-0 slide-in-from-top-1 duration-150"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpenId(null);
          }}
        >
          <div className="mx-auto max-w-7xl px-4">
            <div className="overflow-hidden rounded-b-3xl border border-t-0 border-ivory-200 bg-card shadow-[0_24px_48px_-16px_rgba(15,26,61,0.22)]">
              {openId === 'all' ? (
                <AllCategoriesPanel tree={tree} />
              ) : openCat ? (
                <CategoryPanel category={openCat} />
              ) : null}
            </div>
          </div>
        </div>
      )}
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
          <Menu className="size-5" />
        </span>
        Tất cả
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[85%] gap-0 overflow-y-auto bg-card p-0 [&>button:last-child]:text-white [&>button:last-child]:opacity-90"
      >
        <SheetHeader className="border-b border-ivory-200 bg-navy p-5 text-white">
          <SheetTitle className="flex items-center gap-2 text-white">
            <LayoutGrid className="size-5 text-champagne" /> Danh mục sản phẩm
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
                      cat.id === activeId ? 'text-champagne-600' : 'text-ink',
                    )}
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
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
                      <ChevronDown
                        className={cn('size-4 transition-transform', isOpen && 'rotate-180')}
                      />
                    </button>
                  )}
                </div>
                {isOpen && (
                  <ul className="mb-2 ml-[3.75rem] space-y-0.5 border-l border-champagne/40 pl-3">
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
                  active ? 'bg-champagne text-navy' : 'bg-champagne-50 text-champagne-600',
                )}
              >
                <CategoryIcon icon={cat.icon} className="size-5" strokeWidth={1.75} />
              </span>
              <span
                className={cn(
                  'line-clamp-2 text-[11px] leading-tight',
                  active ? 'font-semibold text-navy' : 'text-ink/75',
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
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center gap-4 overflow-hidden px-4 md:h-14">
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
