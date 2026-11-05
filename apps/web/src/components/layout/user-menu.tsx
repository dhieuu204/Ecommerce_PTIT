import { Heart, LogOut, ReceiptText, ShieldCheck, Star, Store, UserRound } from 'lucide-react';
import { IconUser } from '@tabler/icons-react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/user-avatar';
import { useMyShop } from '@/hooks/use-my-shop';
import { logout, useCurrentUser } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * Menu tài khoản ở góc phải header: tài khoản, shop, quản trị, đăng xuất.
 * tone: shop = header cam khu mua hàng (icon có chữ như các nút bên cạnh); dark/light = Kênh người bán/Quản trị.
 */
export function UserMenu({ tone = 'dark' }: { tone?: 'dark' | 'light' | 'shop' }) {
  const user = useCurrentUser();
  const shop = useMyShop();
  const navigate = useNavigate();
  if (!user) return null;
  const isAdmin = user.permissions.length > 0;
  const shopActive = shop.data?.status === 'ACTIVE' || shop.data?.status === 'SUSPENDED';

  return (
    <DropdownMenu>
      {tone === 'shop' ? (
        <DropdownMenuTrigger
          aria-label={`Tài khoản ${user.fullName}`}
          className="flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 text-xs font-medium text-white outline-none transition hover:opacity-80 focus-visible:ring-2 focus-visible:ring-white/70 sm:px-2"
        >
          <span className="flex size-8 items-center justify-center md:size-7">
            <IconUser className="size-6 [stroke-width:1.5]" />
          </span>
          <span className="hidden whitespace-nowrap lg:block">Tài khoản</span>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          className={cn(
            'flex items-center gap-2 rounded-full p-1 pr-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-champagne',
            tone === 'dark' ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-ivory-200',
          )}
        >
          <UserAvatar name={user.fullName} className="size-8 text-xs" />
          <span className="hidden max-w-32 truncate font-medium md:inline">{user.fullName}</span>
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="truncate font-semibold text-navy">{user.fullName}</div>
          <div className="truncate text-xs text-muted-foreground">{user.email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/tai-khoan/ho-so">
            <UserRound /> Tài khoản của tôi
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/tai-khoan/don-mua">
            <ReceiptText /> Đơn mua
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/tai-khoan/danh-gia">
            <Star /> Đánh giá của tôi
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/tai-khoan/yeu-thich">
            <Heart /> Sản phẩm yêu thích
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={shopActive ? '/kenh-nguoi-ban' : '/tai-khoan/shop'}>
            <Store /> {shopActive ? 'Kênh người bán' : 'Shop của tôi'}
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link to="/quan-tri">
              <ShieldCheck /> Quản trị
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await logout();
            toast.success('Đã đăng xuất.');
            navigate('/');
          }}
        >
          <LogOut /> Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
