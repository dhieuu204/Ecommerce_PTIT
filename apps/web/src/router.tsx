import { createBrowserRouter, Navigate } from 'react-router';
import { RequireActiveShop, RequireAuth, RequirePermission } from '@/components/guards';
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
        element: <RequireAuth />,
        children: [
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
    children: [
      {
        path: 'kenh-nguoi-ban',
        element: <RequireActiveShop />,
        children: [
          {
            element: <SellerLayout />,
            children: [
              { index: true, element: <Navigate to="ho-so-shop" replace /> },
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
