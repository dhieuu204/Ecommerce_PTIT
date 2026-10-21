import { ShieldAlert } from 'lucide-react';
import { SellerChatBadge } from '@/components/chat/chat-badges';
import { useMyShop } from '@/hooks/use-my-shop';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

/** Menu Kênh người bán */
const MENU: ConsoleMenuGroup[] = [
  {
    title: 'Đơn hàng',
    items: [
      { to: '/kenh-nguoi-ban/don-hang', label: 'Tất cả đơn' },
      { to: '/kenh-nguoi-ban/tra-hang', label: 'Trả hàng/Hoàn tiền' },
    ],
  },
  {
    title: 'Chăm sóc khách hàng',
    items: [{ to: '/kenh-nguoi-ban/tin-nhan', label: 'Tin nhắn', badge: <SellerChatBadge /> }],
  },
  {
    title: 'Sản phẩm',
    items: [
      { to: '/kenh-nguoi-ban/san-pham', label: 'Tất cả sản phẩm', end: true },
      { to: '/kenh-nguoi-ban/san-pham/moi', label: 'Thêm sản phẩm' },
    ],
  },
  {
    title: 'Marketing',
    items: [{ to: '/kenh-nguoi-ban/voucher', label: 'Voucher của shop' }],
  },
  {
    title: 'Tài chính',
    items: [{ to: '/kenh-nguoi-ban/tai-chinh', label: 'Ví và rút tiền' }],
  },
  {
    title: 'Shop',
    items: [
      { to: '/kenh-nguoi-ban/ho-so-shop', label: 'Hồ sơ shop' },
      { to: '/kenh-nguoi-ban/ho-so-shop#dia-chi-lay-hang', label: 'Địa chỉ lấy hàng' },
    ],
  },
];

/**
 * Dải báo shop bị đình chỉ (SHP-04): hiện ở đầu mọi trang Kênh người bán. Seller vẫn sửa được hàng,
 * tồn, voucher; hàng tạm ẩn khỏi sàn cho tới khi admin khôi phục.
 */
export function SuspendedBanner({ reason }: { reason: string | null }) {
  return (
    <div
      role="status"
      className="mx-auto mb-6 flex max-w-6xl gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 md:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
        <ShieldAlert className="size-5" />
      </span>
      <div className="min-w-0 text-sm">
        <div className="font-semibold">Shop đang bị đình chỉ: hàng của bạn tạm ẩn khỏi sàn.</div>
        {reason && (
          <p className="mt-1 break-words">
            <span className="font-medium">Lý do:</span> {reason}
          </p>
        )}
        <p className="mt-1 text-amber-900/80">
          Bạn vẫn sửa được sản phẩm, tồn kho và voucher. Liên hệ hỗ trợ của sàn nếu cần trao đổi
          thêm.
        </p>
      </div>
    </div>
  );
}

export function SellerLayout() {
  const shop = useMyShop();
  const suspended = shop.data?.status === 'SUSPENDED';
  return (
    <ConsoleLayout
      area="Kênh người bán"
      tone="seller"
      menu={MENU}
      headerInfo={shop.data?.shop?.name && <>Shop: {shop.data.shop.name}</>}
      menuNote="Rút tiền có từ giai đoạn sau."
      notice={suspended && <SuspendedBanner reason={shop.data?.shop?.suspendReason ?? null} />}
    />
  );
}
