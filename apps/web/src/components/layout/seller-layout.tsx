import { useMyShop } from '@/hooks/use-my-shop';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

/** P1 seller chỉ có nhóm Shop; Đơn hàng, Sản phẩm, Marketing, Tài chính thêm từ P2 */
const MENU: ConsoleMenuGroup[] = [
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
      menuNote="Đơn hàng, Sản phẩm, Marketing, Tài chính có từ giai đoạn sau."
    />
  );
}
