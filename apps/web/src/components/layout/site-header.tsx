import {
  IconBuildingStore,
  IconMessageDots,
  IconShoppingCart,
  IconUser,
  type Icon,
} from '@tabler/icons-react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { BuyerChatBadge } from '@/components/chat/chat-badges';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { useCartCount } from '@/hooks/use-cart';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import { CategoryBar } from './category-bar';
import { SearchBox } from './search-box';
import { UserMenu } from './user-menu';

/** Nút icon nét mảnh có chữ bên dưới, như header onewaymobile.vn */
function HeaderAction({
  to,
  icon: IconComp,
  label,
  badge,
}: {
  to: string;
  icon: Icon;
  label: string;
  badge?: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="group flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-xs font-medium text-white outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/70 sm:px-2"
    >
      <span className="relative flex size-8 items-center justify-center md:size-7">
        <IconComp className="size-6 [stroke-width:1.5]" />
        {badge}
      </span>
      <span className="hidden whitespace-nowrap lg:block">{label}</span>
    </Link>
  );
}

function CartAction({ loggedIn }: { loggedIn: boolean }) {
  const count = useCartCount();
  const n = loggedIn ? (count.data ?? 0) : 0;
  return (
    <HeaderAction
      to={loggedIn ? '/gio-hang' : '/dang-nhap?returnTo=/gio-hang'}
      icon={IconShoppingCart}
      label="Giỏ hàng"
      badge={
        n > 0 && (
          <span
            aria-label={`${n} sản phẩm trong giỏ`}
            className="absolute -top-2 -right-3 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-champagne px-1 text-[10px] leading-none font-bold text-white"
          >
            {n > 99 ? '99+' : n}
          </span>
        )
      }
    />
  );
}

/**
 * Header khu mua hàng (thiết kế HK-Shop-Homepage-Sections/01-header): một thanh nền cam gồm logo, ô tìm
 * kiếm, các nút icon có chữ; bên dưới là thanh danh mục.
 * Máy tính: header cuộn đi, thanh danh mục dính đầu trang. Điện thoại: header dính, ô tìm xuống hàng riêng.
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
      {/* Máy tính: header không dính nhưng nằm lớp trên thanh danh mục (lớp 40) để ô gợi ý tìm kiếm không bị che */}
      <header className="sticky top-0 z-40 bg-gradient-to-b from-header-from to-header-to md:relative md:z-50">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:h-[84px] md:gap-10 lg:gap-14">
          <BrandLogo />
          <SearchBox className="hidden flex-1 md:flex" />
          <nav
            className="ml-auto flex items-center gap-0.5 sm:gap-1 lg:gap-5"
            aria-label="Tài khoản"
          >
            <HeaderAction
              to={loggedIn ? sellerLink : '/dang-nhap?returnTo=/tai-khoan/shop'}
              icon={IconBuildingStore}
              label="Kênh người bán"
            />
            {loggedIn && (
              <HeaderAction
                to="/tin-nhan"
                icon={IconMessageDots}
                label="Tin nhắn"
                badge={<BuyerChatBadge />}
              />
            )}
            {loggedIn && <NotificationBell tone="shop" />}
            <CartAction loggedIn={loggedIn} />
            {loggedIn ? (
              <UserMenu tone="shop" />
            ) : session.status === 'guest' ? (
              <HeaderAction to="/dang-nhap" icon={IconUser} label="Đăng nhập" />
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
