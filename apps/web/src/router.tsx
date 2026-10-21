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
        // Cổng thanh toán MÔ PHỎNG (khi chưa có khóa VNPay): không cần đăng nhập, giống trang của cổng thật
        path: 'thanh-toan/mo-phong',
        lazy: () =>
          import('@/pages/checkout/mock-gateway').then((m) => ({ Component: m.MockGatewayPage })),
      },
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'gio-hang',
            lazy: () => import('@/pages/cart/cart').then((m) => ({ Component: m.CartPage })),
          },
          {
            path: 'dat-hang',
            lazy: () =>
              import('@/pages/checkout/checkout').then((m) => ({ Component: m.CheckoutPage })),
          },
          {
            path: 'thanh-toan/ket-qua',
            lazy: () =>
              import('@/pages/checkout/payment-result').then((m) => ({
                Component: m.PaymentResultPage,
              })),
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
                path: 'don-mua',
                lazy: () =>
                  import('@/pages/account/orders').then((m) => ({ Component: m.OrdersPage })),
              },
              {
                path: 'don-mua/:orderId',
                lazy: () =>
                  import('@/pages/account/order-detail').then((m) => ({
                    Component: m.OrderDetailPage,
                  })),
              },
              {
                path: 'don-mua/:orderId/tra-hang/:shopOrderId',
                lazy: () =>
                  import('@/pages/account/return-request').then((m) => ({
                    Component: m.ReturnRequestPage,
                  })),
              },
              {
                path: 'tra-hang',
                lazy: () =>
                  import('@/pages/account/returns').then((m) => ({ Component: m.ReturnsPage })),
              },
              {
                path: 'tra-hang/:returnId',
                lazy: () =>
                  import('@/pages/account/return-detail').then((m) => ({
                    Component: m.ReturnDetailPage,
                  })),
              },
              {
                path: 'shop',
                lazy: () =>
                  import('@/pages/account/my-shop').then((m) => ({ Component: m.MyShopPage })),
              },
              {
                path: 'bao-cao-vi-pham',
                lazy: () =>
                  import('@/pages/account/violation-reports').then((m) => ({
                    Component: m.MyViolationReportsPage,
                  })),
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
              { index: true, element: <Navigate to="don-hang" replace /> },
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
                path: 'don-hang',
                lazy: () =>
                  import('@/pages/seller/orders').then((m) => ({
                    Component: m.SellerOrdersPage,
                  })),
              },
              {
                path: 'don-hang/:shopOrderId',
                lazy: () =>
                  import('@/pages/seller/order-detail').then((m) => ({
                    Component: m.SellerOrderDetailPage,
                  })),
              },
              {
                path: 'tra-hang',
                lazy: () =>
                  import('@/pages/seller/returns').then((m) => ({
                    Component: m.SellerReturnsPage,
                  })),
              },
              {
                path: 'tra-hang/:returnId',
                lazy: () =>
                  import('@/pages/seller/return-detail').then((m) => ({
                    Component: m.SellerReturnDetailPage,
                  })),
              },
              {
                path: 'ho-so-shop',
                lazy: () =>
                  import('@/pages/seller/shop-profile').then((m) => ({
                    Component: m.ShopProfilePage,
                  })),
              },
              {
                path: 'tai-chinh',
                lazy: () =>
                  import('@/pages/seller/finance').then((m) => ({
                    Component: m.SellerFinancePage,
                  })),
              },
              {
                path: 'bao-cao',
                lazy: () =>
                  import('@/pages/seller/reports').then((m) => ({
                    Component: m.SellerReportsPage,
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
                  {
                    path: 'bao-cao-vi-pham',
                    lazy: () =>
                      import('@/pages/admin/violation-reports').then((m) => ({
                        Component: m.ViolationReportsPage,
                      })),
                  },
                  {
                    path: 'bao-cao-vi-pham/:reportId',
                    lazy: () =>
                      import('@/pages/admin/violation-reports').then((m) => ({
                        Component: m.ViolationReportDetailPage,
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
                  {
                    path: 'duyet-don',
                    lazy: () =>
                      import('@/pages/admin/order-checks').then((m) => ({
                        Component: m.OrderChecksPage,
                      })),
                  },
                  {
                    path: 'duyet-don/:checkId',
                    lazy: () =>
                      import('@/pages/admin/order-checks').then((m) => ({
                        Component: m.OrderCheckDetailPage,
                      })),
                  },
                  {
                    path: 'hoan-tien',
                    lazy: () =>
                      import('@/pages/admin/refunds').then((m) => ({ Component: m.RefundsPage })),
                  },
                  {
                    path: 'doi-soat-cod',
                    lazy: () =>
                      import('@/pages/admin/cod-reconciliation').then((m) => ({
                        Component: m.CodReconciliationsPage,
                      })),
                  },
                  {
                    path: 'doi-soat-cod/:id',
                    lazy: () =>
                      import('@/pages/admin/cod-reconciliation').then((m) => ({
                        Component: m.CodReconciliationDetailPage,
                      })),
                  },
                  {
                    path: 'doi-soat-vnpay',
                    lazy: () =>
                      import('@/pages/admin/vnpay-reconciliation').then((m) => ({
                        Component: m.VnpayReconciliationPage,
                      })),
                  },
                  {
                    path: 'rut-tien',
                    lazy: () =>
                      import('@/pages/admin/withdrawals').then((m) => ({
                        Component: m.WithdrawalsPage,
                      })),
                  },
                  {
                    path: 'dieu-chinh-vi',
                    lazy: () =>
                      import('@/pages/admin/adjustments').then((m) => ({
                        Component: m.AdjustmentsPage,
                      })),
                  },
                ],
              },
              {
                element: <RequirePermission any={['SYSTEM', 'FINANCE']} />,
                children: [
                  {
                    path: 'bao-cao',
                    lazy: () =>
                      import('@/pages/admin/reports').then((m) => ({
                        Component: m.AdminReportsPage,
                      })),
                  },
                ],
              },
              {
                element: <RequirePermission any={['SUPPORT']} />,
                children: [
                  {
                    path: 'don-hang',
                    lazy: () =>
                      import('@/pages/admin/orders').then((m) => ({
                        Component: m.AdminOrdersPage,
                      })),
                  },
                  {
                    path: 'don-hang/:orderId',
                    lazy: () =>
                      import('@/pages/admin/orders').then((m) => ({
                        Component: m.AdminOrderDetailPage,
                      })),
                  },
                  {
                    path: 'tra-hang',
                    lazy: () =>
                      import('@/pages/admin/returns').then((m) => ({
                        Component: m.AdminReturnsPage,
                      })),
                  },
                  {
                    path: 'tra-hang/:returnId',
                    lazy: () =>
                      import('@/pages/admin/returns').then((m) => ({
                        Component: m.AdminReturnDetailPage,
                      })),
                  },
                  {
                    path: 'tranh-chap',
                    lazy: () =>
                      import('@/pages/admin/disputes').then((m) => ({
                        Component: m.DisputesPage,
                      })),
                  },
                  {
                    path: 'tranh-chap/:disputeId',
                    lazy: () =>
                      import('@/pages/admin/disputes').then((m) => ({
                        Component: m.DisputeDetailPage,
                      })),
                  },
                  {
                    path: 'ghn-mo-phong',
                    lazy: () =>
                      import('@/pages/admin/carrier-simulator').then((m) => ({
                        Component: m.CarrierSimulatorPage,
                      })),
                  },
                ],
              },
              {
                element: <RequirePermission any={['SYSTEM', 'FINANCE']} />,
                children: [
                  {
                    path: 'cau-hinh',
                    lazy: () =>
                      import('@/pages/admin/settings').then((m) => ({ Component: m.SettingsPage })),
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
