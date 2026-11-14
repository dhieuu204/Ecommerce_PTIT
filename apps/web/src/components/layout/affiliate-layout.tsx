import { IconShieldExclamation } from '@tabler/icons-react';
import { useMyAffiliate } from '@/hooks/use-my-affiliate';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

/** Menu khu Cộng tác viên (P7) */
const MENU: ConsoleMenuGroup[] = [
  {
    title: 'Tổng quan',
    items: [{ to: '/cong-tac-vien', label: 'Hiệu quả tiếp thị', end: true }],
  },
  {
    title: 'Tiếp thị',
    items: [
      { to: '/cong-tac-vien/san-pham', label: 'Sản phẩm có hoa hồng' },
      { to: '/cong-tac-vien/don-hang', label: 'Đơn qua link của tôi' },
    ],
  },
  {
    title: 'Tài chính',
    items: [{ to: '/cong-tac-vien/vi', label: 'Ví và rút tiền' }],
  },
  {
    title: 'Tài khoản',
    items: [{ to: '/cong-tac-vien/ho-so', label: 'Hồ sơ cộng tác viên' }],
  },
];

/** Dải báo CTV bị khóa: link không tính đơn mới, không rút được tiền; đơn cũ vẫn tính hoa hồng */
function SuspendedNotice({ reason }: { reason: string | null }) {
  return (
    <div
      role="status"
      className="mx-auto mb-6 flex max-w-6xl gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 md:p-5"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 ring-1 ring-amber-200">
        <IconShieldExclamation className="size-5" />
      </span>
      <div className="min-w-0 text-sm">
        <div className="font-semibold">Tài khoản cộng tác viên đang bị khóa.</div>
        {reason && (
          <p className="mt-1 break-words">
            <span className="font-medium">Lý do:</span> {reason}
          </p>
        )}
        <p className="mt-1 text-amber-900/80">
          Link của bạn tạm không tính đơn mới và chưa rút được tiền. Đơn đặt trước đó vẫn được tính
          hoa hồng như thường.
        </p>
      </div>
    </div>
  );
}

export function AffiliateLayout() {
  const me = useMyAffiliate();
  const a = me.data?.affiliate;
  return (
    <ConsoleLayout
      area="Cộng tác viên"
      tone="seller"
      homeTo="/cong-tac-vien"
      menu={MENU}
      headerInfo={a && <>{a.displayName}</>}
      notice={
        me.data?.status === 'SUSPENDED' && <SuspendedNotice reason={a?.suspendReason ?? null} />
      }
    />
  );
}
