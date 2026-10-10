import { createBrowserRouter, Navigate } from 'react-router';
import {
  FullPageSpinner,
  RequireActiveShop,
  RequireAuth,
  RequirePermission,
} from '@/components/guards';
import { AccountLayout } from '@/components/layout/account-layout';
import { AdminLayout, firstAdminPage } from '@/components/layout/admin-layout';
import { SellerLayout } from '@/components/layout/seller-layout';
import { ShopLayout } from '@/components/layout/shop-layout';
import { sessionStore } from '@/lib/api';
import { HomePage } from '@/pages/home';
import { NotFoundPage } from '@/pages/not-found';

/**
 * Bảng đường dẫn của web (React Router). Đường dẫn tiếng Việt không dấu.
 * - Khu mua hàng: /, /dang-nhap, /tai-khoan/...
 * - Kênh người bán: /kenh-nguoi-ban/... (shop đang hoạt động)
 * - Quản trị: /quan-tri/... (có bộ quyền admin)
 * Trang chủ tải ngay; các trang khác tải khi mở lần đầu (`lazy`) để lần vào web đầu tiên nhẹ hơn.
 */
function AdminIndex() {
  const s = sessionStore.get();
  return <Navigate to={firstAdminPage(s.status === 'user' ? s.user.permissions : [])} replace />;
}

export const router = createBrowserRouter([
  {
    element: <ShopLayout />,
    // Mở thẳng một trang tải riêng (ví dụ /dang-nhap): hiện vòng xoay trong lúc tải
    HydrateFallback: FullPageSpinner,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'dang-nhap',
        lazy: () => import('@/pages/auth/login').then((m) => ({ Component: m.LoginPage })),
      },
      {
        path: 'dang-ky',
        lazy: () => import('@/pages/auth/register').then((m) => ({ Component: m.RegisterPage })),
      },
      {
        path: 'xac-minh-email',
        lazy: () =>
          import('@/pages/auth/verify-email').then((m) => ({ Component: m.VerifyEmailPage })),
      },
      {
        path: 'quen-mat-khau',
        lazy: () =>
          import('@/pages/auth/forgot-password').then((m) => ({ Component: m.ForgotPasswordPage })),
      },
      {
        path: 'danh-muc/:slug',
        lazy: () => import('@/pages/catalog/category').then((m) => ({ Component: m.CategoryPage })),
      },
      {
        path: 'tim-kiem',
        lazy: () => import('@/pages/catalog/search').then((m) => ({ Component: m.SearchPage })),
      },
      {
        path: 'san-pham/:productId',
        lazy: () => import('@/pages/catalog/product').then((m) => ({ Component: m.ProductPage })),
      },
      {
        path: 'shop/:shopId',
        lazy: () => import('@/pages/catalog/shop').then((m) => ({ Component: m.ShopPage })),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'gio-hang',
            lazy: () => import('@/pages/cart/cart').then((m) => ({ Component: m.CartPage })),
          },
          {
            path: 'tai-khoan',
            element: <AccountLayout />,
            children: [
              { index: true, element: <Navigate to="ho-so" replace /> },
              {
                path: 'ho-so',
                lazy: () =>
                  import('@/pages/account/profile').then((m) => ({ Component: m.ProfilePage })),
              },
              {
                path: 'mat-khau',
                lazy: () =>
                  import('@/pages/account/password').then((m) => ({ Component: m.PasswordPage })),
              },
              {
                path: 'dia-chi',
                lazy: () =>
                  import('@/pages/account/addresses').then((m) => ({ Component: m.AddressesPage })),
              },
              {
                path: 'shop',
                lazy: () =>
                  import('@/pages/account/my-shop').then((m) => ({ Component: m.MyShopPage })),
              },
              {
                path: 'shop/dang-ky',
                lazy: () =>
                  import('@/pages/account/shop-apply').then((m) => ({
                    Component: m.ShopApplyPage,
                  })),
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    HydrateFallback: FullPageSpinner,
    children: [
      {
        path: 'kenh-nguoi-ban',
        element: <RequireActiveShop />,
        children: [
          {
            element: <SellerLayout />,
            children: [
              { index: true, element: <Navigate to="san-pham" replace /> },
              {
                path: 'san-pham',
                lazy: () =>
                  import('@/pages/seller/products').then((m) => ({ Component: m.ProductsPage })),
              },
              {
                path: 'san-pham/moi',
                lazy: () =>
                  import('@/pages/seller/product-form').then((m) => ({
                    Component: m.ProductFormPage,
                  })),
              },
              {
                path: 'san-pham/:productId',
                lazy: () =>
                  import('@/pages/seller/product-form').then((m) => ({
                    Component: m.ProductFormPage,
                  })),
              },
              {
                path: 'voucher',
                lazy: () =>
                  import('@/pages/seller/vouchers').then((m) => ({
                    Component: m.SellerVouchersPage,
                  })),
              },
              {
                path: 'ho-so-shop',
                lazy: () =>
                  import('@/pages/seller/shop-profile').then((m) => ({
                    Component: m.ShopProfilePage,
                  })),
              },
            ],
          },
        ],
      },
      {
        path: 'quan-tri',
        element: <RequirePermission />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminIndex /> },
              {
                element: <RequirePermission any={['MODERATION']} />,
                children: [
                  {
                    path: 'duyet-shop',
                    lazy: () =>
                      import('@/pages/admin/shop-approvals').then((m) => ({
                        Component: m.ShopApprovalsPage,
                      })),
                  },
                  {
                    path: 'duyet-shop/:approvalId',
                    lazy: () =>
                      import('@/pages/admin/shop-approval-detail').then((m) => ({
                        Component: m.ShopApprovalDetailPage,
                      })),
                  },
                  {
                    path: 'danh-muc',
                    lazy: () =>
                      import('@/pages/admin/categories').then((m) => ({
                        Component: m.CategoriesPage,
                      })),
                  },
                  {
                    path: 'shop',
                    lazy: () =>
                      import('@/pages/admin/shops').then((m) => ({ Component: m.ShopsPage })),
                  },
                  {
                    path: 'shop/:shopId',
                    lazy: () =>
                      import('@/pages/admin/shop-detail').then((m) => ({
                        Component: m.ShopDetailPage,
                      })),
                  },
                ],
              },
              {
                element: <RequirePermission any={['FINANCE']} />,
                children: [
                  {
                    path: 'voucher',
                    lazy: () =>
                      import('@/pages/admin/vouchers').then((m) => ({
                        Component: m.AdminVouchersPage,
                      })),
                  },
                ],
              },
              {
                element: <RequirePermission any={['SYSTEM']} />,
                children: [
                  {
                    path: 'nguoi-dung',
                    lazy: () =>
                      import('@/pages/admin/users').then((m) => ({ Component: m.UsersPage })),
                  },
                  {
                    path: 'nhat-ky',
                    lazy: () =>
                      import('@/pages/admin/audit-logs').then((m) => ({
                        Component: m.AuditLogsPage,
                      })),
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
