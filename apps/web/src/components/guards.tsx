import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMyShop } from '@/hooks/use-my-shop';
import { hasAnyPermission, useSession } from '@/lib/auth';
import type { Permission } from '@/lib/types';

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  );
}

/** Trang cần đăng nhập: chưa đăng nhập thì sang /dang-nhap rồi quay lại */
export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.status === 'loading') return <FullPageSpinner />;
  if (session.status === 'guest') {
    const returnTo = location.pathname + location.search;
    return <Navigate to={`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }
  return <Outlet />;
}

/** Kênh người bán: chỉ khi shop đang hoạt động; chưa có thì về "Shop của tôi" */
export function RequireActiveShop() {
  const shop = useMyShop();
  if (shop.isPending) return <FullPageSpinner />;
  if (shop.data?.status !== 'ACTIVE') return <Navigate to="/tai-khoan/shop" replace />;
  return <Outlet />;
}

/**
 * Khu quản trị: cần ít nhất một bộ quyền trong `any` (mặc định: là admin). Đây chỉ là ẩn giao diện;
 * backend vẫn tự kiểm quyền từng API.
 */
export function RequirePermission({ any }: { any?: Permission[] }) {
  const session = useSession();
  if (session.status === 'loading') return <FullPageSpinner />;
  const perms = session.status === 'user' ? session.user.permissions : [];
  const ok = any ? hasAnyPermission(perms, any) : perms.length > 0;
  return ok ? <Outlet /> : <Navigate to="/" replace />;
}
