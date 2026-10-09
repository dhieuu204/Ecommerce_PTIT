import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { UserMenu } from './user-menu';

export interface ConsoleMenuGroup {
  title: string;
  items: Array<{ to: string; label: string; end?: boolean }>;
}

interface ConsoleLayoutProps {
  /** "Kênh người bán" hoặc "Quản trị" */
  area: string;
  /** seller: header trắng; admin: header màu than (không nhầm với khu mua/bán) */
  tone: 'seller' | 'admin';
  menu: ConsoleMenuGroup[];
  /** Chữ nhỏ giữa header, ví dụ tên shop hoặc bộ quyền */
  headerInfo?: React.ReactNode;
  /** Ghi chú cuối menu, ví dụ "Đơn hàng, Sản phẩm... hiện từ P2" */
  menuNote?: string;
}

function MenuList({
  menu,
  note,
  onNavigate,
}: {
  menu: ConsoleMenuGroup[];
  note?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-5 p-4">
      {menu.map((group) => (
        <div key={group.title}>
          <div className="mb-1.5 px-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            {group.title}
          </div>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  'block rounded-lg border-l-[3px] px-3 py-2 text-sm transition',
                  isActive
                    ? 'border-champagne bg-champagne-50 font-medium text-navy'
                    : 'border-transparent text-ink hover:bg-ivory-200',
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </div>
      ))}
      {note && <p className="px-3 text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </nav>
  );
}

/**
 * Khung Kênh người bán và Quản trị (docs/so-do/07 mục C, D): header mỏng + menu trái theo nhóm việc.
 * Điện thoại: menu trái vào nút ☰ (bảng trượt).
 */
export function ConsoleLayout({ area, tone, menu, headerInfo, menuNote }: ConsoleLayoutProps) {
  const [open, setOpen] = useState(false);
  const dark = tone === 'admin';
  return (
    <div className="flex min-h-screen flex-col bg-ivory">
      <header
        className={cn(
          'sticky top-0 z-40 border-b',
          dark ? 'border-white/10 bg-charcoal text-white' : 'bg-white text-ink',
        )}
      >
        <div className="flex h-14 items-center gap-3 px-4">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className={cn(
                'rounded-lg border p-2 lg:hidden',
                dark ? 'border-white/20' : 'border-border',
              )}
              aria-label="Mở menu"
            >
              <Menu className="size-4" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-ivory p-0">
              <SheetHeader className="border-b">
                <SheetTitle className="text-navy">{area}</SheetTitle>
              </SheetHeader>
              <MenuList menu={menu} note={menuNote} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <BrandLogo
            to="/"
            className={cn(
              'hidden sm:inline-flex',
              dark ? '' : 'border-navy bg-navy text-champagne hover:bg-navy-800',
            )}
          />
          <Link
            to={dark ? '/quan-tri' : '/kenh-nguoi-ban'}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <span className={cn('hidden sm:inline', dark ? 'text-white/40' : 'text-border')}>
              |
            </span>
            {area}
          </Link>
          <div
            className={cn(
              'ml-auto hidden truncate text-xs md:block',
              dark ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            {headerInfo}
          </div>
          <UserMenu tone={dark ? 'dark' : 'light'} />
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r bg-ivory-200/60 lg:block">
          <div className="sticky top-14">
            <MenuList menu={menu} note={menuNote} />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
