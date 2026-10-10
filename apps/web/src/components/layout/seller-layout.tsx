import { useMyShop } from '@/hooks/use-my-shop';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

/** Menu Kênh người bán. Đơn hàng (P3) và Tài chính (P3–P5) thêm khi tới giai đoạn */
const MENU: ConsoleMenuGroup[] = [
  {
    title: 'Sản phẩm',
    items: [
      { to: '/kenh-nguoi-ban/san-pham', label: 'Tất cả sản phẩm' },
      { to: '/kenh-nguoi-ban/san-pham/moi', label: 'Thêm sản phẩm' },
    ],
  },
  {
    title: 'Marketing',
    items: [{ to: '/kenh-nguoi-ban/voucher', label: 'Voucher của shop' }],
  },
  {
    title: 'Shop',
    items: [
      { to: '/kenh-nguoi-ban/ho-so-shop', label: 'Hồ sơ shop' },
      { to: '/kenh-nguoi-ban/ho-so-shop#dia-chi-lay-hang', label: 'Địa chỉ lấy hàng' },
    ],
  },
];

export function SellerLayout() {
  const shop = useMyShop();
  return (
    <ConsoleLayout
      area="Kênh người bán"
      tone="seller"
      menu={MENU}
      headerInfo={shop.data?.shop?.name && <>Shop: {shop.data.shop.name}</>}
      menuNote="Đơn hàng, Tài chính có từ giai đoạn sau."
    />
  );
}
