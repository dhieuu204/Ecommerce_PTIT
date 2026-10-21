import { MessageCircle, Search, ShoppingCart, Store, UserRound } from 'lucide-react';
import { useRef } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { BuyerChatBadge } from '@/components/chat/chat-badges';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useCartCount } from '@/hooks/use-cart';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { CategoryBar } from './category-bar';
import { UserMenu } from './user-menu';

/** Nút icon tròn có chữ nhỏ bên dưới, như header onewaymobile.vn */
function HeaderAction({
  to,
  icon,
  label,
  badge,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="group flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-[11px] font-medium text-white/85 outline-none transition hover:text-champagne focus-visible:ring-2 focus-visible:ring-champagne sm:px-2"
    >
      <span className="relative flex size-9 items-center justify-center rounded-full border border-white/25 transition group-hover:border-champagne">
        {icon}
        {badge}
      </span>
      <span className="hidden whitespace-nowrap lg:block">{label}</span>
    </Link>
  );
}

/** Ô tìm kiếm bo tròn: gửi tới /tim-kiem?q=...; ở trang tìm kiếm thì giữ từ khóa đang tìm */
function SearchBox({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();
  const current = pathname === '/tim-kiem' ? (params.get('q') ?? '') : '';
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <form
      role="search"
      // key: đổi từ khóa trên đường dẫn (bấm quay lại, bấm gợi ý) thì ô tìm hiện đúng từ khóa đó
      key={current}
      className={cn(
        'group flex h-10 items-center rounded-full bg-card pr-1 pl-4 transition focus-within:ring-2 focus-within:ring-champagne md:h-11 md:pl-5',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault();
        const q = inputRef.current?.value.trim() ?? '';
        if (!q) {
          inputRef.current?.focus();
          return;
        }
        inputRef.current?.blur();
        navigate(`/tim-kiem?q=${encodeURIComponent(q)}`);
      }}
    >
      <input
        ref={inputRef}
        type="search"
        name="q"
        defaultValue={current}
        maxLength={100}
        aria-label="Tìm sản phẩm"
        placeholder="Bạn cần tìm gì? Ví dụ: iphone, tai nghe…"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink/40 [&::-webkit-search-cancel-button]:hidden"
      />
      <button
        type="submit"
        aria-label="Tìm kiếm"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-navy px-3 text-sm font-medium text-white transition hover:bg-navy-800 md:h-9 md:px-4"
      >
        <Search className="size-4 text-champagne" />
        <span className="hidden lg:inline">Tìm</span>
      </button>
    </form>
  );
}

function CartAction({ loggedIn }: { loggedIn: boolean }) {
  const count = useCartCount();
  const n = loggedIn ? (count.data ?? 0) : 0;
  return (
    <HeaderAction
      to={loggedIn ? '/gio-hang' : '/dang-nhap?returnTo=/gio-hang'}
      icon={<ShoppingCart className="size-4" />}
      label="Giỏ hàng"
      badge={
        n > 0 && (
          <span
            aria-label={`${n} sản phẩm trong giỏ`}
            className="absolute -top-1.5 -right-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-champagne px-1 text-[10px] leading-none font-bold text-navy ring-2 ring-navy"
          >
            {n > 99 ? '99+' : n}
          </span>
        )
      }
    />
  );
}

/**
 * Header khu mua hàng (docs/so-do/07-ui-khung-chung, mục A): logo, ô tìm kiếm, Kênh người bán,
 * giỏ hàng, tài khoản; bên dưới là thanh danh mục có mega menu. Tra cứu đơn có từ P3 nên chưa hiện.
 * Trên điện thoại ô tìm kiếm xuống một hàng riêng dưới logo (phần dính đầu trang cao 6.5rem).
 */
export function SiteHeader() {
  const session = useSession();
  const shop = useMyShop();
  const loggedIn = session.status === 'user';
  const sellerLink =
    shop.data?.status === 'ACTIVE' || shop.data?.status === 'SUSPENDED'
      ? '/kenh-nguoi-ban'
      : '/tai-khoan/shop';

  return (
    <>
      <header className="sticky top-0 z-40 bg-navy shadow-[0_1px_0_rgba(200,169,107,0.25)]">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:h-20 md:gap-6">
          <BrandLogo className="px-3 py-1 text-xs md:px-4 md:py-1.5 md:text-sm" />
          <SearchBox className="hidden max-w-3xl flex-1 md:flex" />
          <nav className="ml-auto flex items-center gap-0.5 sm:gap-2" aria-label="Tài khoản">
            <HeaderAction
              to={loggedIn ? sellerLink : '/dang-nhap?returnTo=/tai-khoan/shop'}
              icon={<Store className="size-4" />}
              label="Kênh người bán"
            />
            {loggedIn && (
              <HeaderAction
                to="/tin-nhan"
                icon={<MessageCircle className="size-4" />}
                label="Tin nhắn"
                badge={<BuyerChatBadge />}
              />
            )}
            {loggedIn && <NotificationBell tone="shop" />}
            <CartAction loggedIn={loggedIn} />
            {loggedIn ? (
              <UserMenu />
            ) : session.status === 'guest' ? (
              <HeaderAction
                to="/dang-nhap"
                icon={<UserRound className="size-4" />}
                label="Đăng nhập"
              />
            ) : (
              <span className="size-9 animate-pulse rounded-full bg-white/10" />
            )}
          </nav>
        </div>
        <div className="flex h-12 items-start px-4 md:hidden">
          <SearchBox className="w-full" />
        </div>
      </header>
      <CategoryBar />
    </>
  );
}
