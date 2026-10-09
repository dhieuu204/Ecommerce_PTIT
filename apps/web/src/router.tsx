import { createBrowserRouter, Navigate } from 'react-router';
import { RequireActiveShop, RequireAuth, RequirePermission } from '@/components/guards';
import { AccountLayout } from '@/components/layout/account-layout';
import { AdminLayout, firstAdminPage } from '@/components/layout/admin-layout';
import { SellerLayout } from '@/components/layout/seller-layout';
import { ShopLayout } from '@/components/layout/shop-layout';
import { sessionStore } from '@/lib/api';
import { HomePage } from '@/pages/home';
import { NotFoundPage } from '@/pages/not-found';
import { AuditLogsPage } from '@/pages/admin/audit-logs';
import { ShopApprovalDetailPage } from '@/pages/admin/shop-approval-detail';
import { ShopApprovalsPage } from '@/pages/admin/shop-approvals';
import { UsersPage } from '@/pages/admin/users';
import { Placeholder } from '@/pages/placeholder';
import { ShopProfilePage } from '@/pages/seller/shop-profile';

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
      { path: 'dang-nhap', element: <Placeholder title="Đăng nhập" /> },
      { path: 'dang-ky', element: <Placeholder title="Đăng ký" /> },
      { path: 'xac-minh-email', element: <Placeholder title="Xác minh email" /> },
      { path: 'quen-mat-khau', element: <Placeholder title="Quên mật khẩu" /> },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'tai-khoan',
            element: <AccountLayout />,
            children: [
              { index: true, element: <Navigate to="ho-so" replace /> },
              { path: 'ho-so', element: <Placeholder title="Hồ sơ của tôi" /> },
              { path: 'mat-khau', element: <Placeholder title="Đổi mật khẩu" /> },
              { path: 'dia-chi', element: <Placeholder title="Sổ địa chỉ" /> },
              { path: 'shop', element: <Placeholder title="Shop của tôi" /> },
              { path: 'shop/dang-ky', element: <Placeholder title="Đăng ký mở shop" /> },
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
              { path: 'ho-so-shop', element: <ShopProfilePage /> },
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
                  { path: 'duyet-shop', element: <ShopApprovalsPage /> },
                  { path: 'duyet-shop/:approvalId', element: <ShopApprovalDetailPage /> },
                ],
              },
              {
                element: <RequirePermission any={['SYSTEM']} />,
                children: [
                  { path: 'nguoi-dung', element: <UsersPage /> },
                  { path: 'nhat-ky', element: <AuditLogsPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
]);
