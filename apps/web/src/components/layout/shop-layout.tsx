import { Outlet } from 'react-router';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';

/** Khung khu mua hàng: header + nội dung + footer */
export function ShopLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
