import { Outlet, ScrollRestoration } from 'react-router';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/**
 * Khung khu mua hàng: header + nội dung + footer. Mọi trang (cả Kênh người bán, quản trị) nằm trong khung này.
 * Sang trang mới thì cuộn lên đầu; chỉ đổi bộ lọc trên cùng trang (?sort=...) thì giữ chỗ đang xem.
 */
export function ShopLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
      <ScrollRestoration getKey={(location) => location.pathname} />
    </div>
  );
}
