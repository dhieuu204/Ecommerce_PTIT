import { Store, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import { UserMenu } from './user-menu';

/** Nút icon tròn có chữ nhỏ bên dưới, như header onewaymobile.vn */
function HeaderAction({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="group flex flex-col items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-medium text-white/85 transition hover:text-champagne"
    >
      <span className="flex size-9 items-center justify-center rounded-full border border-white/25 transition group-hover:border-champagne">
        {icon}
      </span>
      <span className="hidden sm:block">{label}</span>
    </Link>
  );
}

/**
 * Header khu mua hàng (docs/so-do/07-ui-khung-chung, mục A). Ô tìm kiếm, giỏ hàng, tra cứu đơn và
 * thanh danh mục có từ P2/P3 nên chưa hiện (không để nút chết).
 */
export function SiteHeader() {
  const session = useSession();
  const shop = useMyShop();
  const sellerLink = shop.data?.status === 'ACTIVE' ? '/kenh-nguoi-ban' : '/tai-khoan/shop';

  return (
    <header className="sticky top-0 z-40 bg-navy shadow-[0_1px_0_rgba(200,169,107,0.25)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 md:h-20">
        <BrandLogo />
        <p className="hidden flex-1 text-center text-xs tracking-wide text-champagne/90 lg:block">
          Sàn mua sắm nhiều shop · Giao hàng GHN · Thanh toán VNPay hoặc khi nhận hàng
        </p>
        <nav className="ml-auto flex items-center gap-1 sm:gap-3">
          <HeaderAction
            to={session.status === 'user' ? sellerLink : '/dang-nhap?returnTo=/tai-khoan/shop'}
            icon={<Store className="size-4" />}
            label="Kênh người bán"
          />
          {session.status === 'user' ? (
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
    </header>
  );
}
