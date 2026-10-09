import { createBrowserRouter, Navigate } from 'react-router';
import { RequireActiveShop, RequireAuth, RequirePermission } from '@/components/guards';
import { AccountLayout } from '@/components/layout/account-layout';
import { AdminLayout, firstAdminPage } from '@/components/layout/admin-layout';
import { SellerLayout } from '@/components/layout/seller-layout';
import { ShopLayout } from '@/components/layout/shop-layout';
import { sessionStore } from '@/lib/api';
import { HomePage } from '@/pages/home';
import { NotFoundPage } from '@/pages/not-found';
import { Placeholder } from '@/pages/placeholder';
import { AddressesPage } from '@/pages/account/addresses';
import { MyShopPage } from '@/pages/account/my-shop';
import { PasswordPage } from '@/pages/account/password';
import { ProfilePage } from '@/pages/account/profile';
import { ShopApplyPage } from '@/pages/account/shop-apply';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password';
import { LoginPage } from '@/pages/auth/login';
import { RegisterPage } from '@/pages/auth/register';
import { VerifyEmailPage } from '@/pages/auth/verify-email';

/**
 * Bảng đường dẫn của web (React Router). Đường dẫn tiếng Việt không dấu.
 * - Khu mua hàng: /, /dang-nhap, /tai-khoan/...
 * - Kênh người bán: /kenh-nguoi-ban/... (shop đang hoạt động)
 * - Quản trị: /quan-tri/... (có bộ quyền admin)
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
      { path: 'dang-nhap', element: <LoginPage /> },
      { path: 'dang-ky', element: <RegisterPage /> },
      { path: 'xac-minh-email', element: <VerifyEmailPage /> },
      { path: 'quen-mat-khau', element: <ForgotPasswordPage /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'tai-khoan',
            element: <AccountLayout />,
            children: [
              { index: true, element: <Navigate to="ho-so" replace /> },
              { path: 'ho-so', element: <ProfilePage /> },
              { path: 'mat-khau', element: <PasswordPage /> },
              { path: 'dia-chi', element: <AddressesPage /> },
              { path: 'shop', element: <MyShopPage /> },
              { path: 'shop/dang-ky', element: <ShopApplyPage /> },
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
              { path: 'ho-so-shop', element: <Placeholder title="Hồ sơ shop" /> },
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
                  { path: 'duyet-shop', element: <Placeholder title="Duyệt shop" /> },
                  {
                    path: 'duyet-shop/:approvalId',
                    element: <Placeholder title="Chi tiết hồ sơ" />,
                  },
                ],
              },
              {
                element: <RequirePermission any={['SYSTEM']} />,
                children: [
                  { path: 'nguoi-dung', element: <Placeholder title="Người dùng và quyền" /> },
                  { path: 'nhat-ky', element: <Placeholder title="Nhật ký thao tác" /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
