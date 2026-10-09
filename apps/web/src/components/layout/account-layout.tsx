import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { UserAvatar } from '@/components/user-avatar';
import { useCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

const MENU = [
  { to: '/tai-khoan/ho-so', label: 'Hồ sơ của tôi' },
  { to: '/tai-khoan/mat-khau', label: 'Đổi mật khẩu' },
  { to: '/tai-khoan/dia-chi', label: 'Sổ địa chỉ' },
  { to: '/tai-khoan/shop', label: 'Shop của tôi' },
];

/**
 * Tài khoản của tôi (docs/so-do/07 mục A2): menu trái + nội dung. Điện thoại: menu thành hàng nút cuộn ngang.
 * Đơn mua, voucher, thông báo thêm vào MENU khi tới P2/P3/P6.
 */
export function AccountLayout() {
  const user = useCurrentUser();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  // Điện thoại: hàng nút cuộn ngang, cuộn mục đang mở vào giữa cho dễ thấy
  useEffect(() => {
    const nav = navRef.current;
    const active = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (nav && active && nav.scrollWidth > nav.clientWidth) {
      const offset = active.getBoundingClientRect().left - nav.getBoundingClientRect().left;
      nav.scrollLeft += offset - (nav.clientWidth - active.offsetWidth) / 2;
    }
  }, [location.pathname]);
  return (
    <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 md:grid-cols-[260px_minmax(0,1fr)] md:py-10">
      <aside className="md:sticky md:top-28 md:self-start">
        <div className="rounded-2xl border bg-card p-4 shadow-sm md:p-5">
          {user && (
            <div className="flex items-center gap-3 border-b pb-4">
              <UserAvatar name={user.fullName} />
              <div className="min-w-0">
                <div className="truncate font-semibold text-navy">{user.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </div>
          )}
          <nav
            ref={navRef}
            className="-mx-1 mt-3 flex gap-2 overflow-x-auto pb-1 md:mx-0 md:flex-col md:gap-1 md:overflow-visible"
          >
            {MENU.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'shrink-0 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition md:rounded-lg md:border-0 md:border-l-[3px] md:border-transparent md:px-3',
                    isActive
                      ? 'border-champagne bg-champagne-50 font-medium text-navy md:border-champagne'
                      : 'text-ink hover:bg-ivory-200',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>
      <section className="min-w-0">
        <Outlet />
      </section>
    </div>
  );
}
