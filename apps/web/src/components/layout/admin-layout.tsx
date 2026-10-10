import { useCurrentUser } from '@/lib/auth';
import type { Permission } from '@/lib/types';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

export const PERMISSION_LABELS: Record<Permission, string> = {
  MODERATION: 'Kiểm duyệt',
  SUPPORT: 'Hỗ trợ',
  FINANCE: 'Tài chính / rủi ro',
  SYSTEM: 'Hệ thống',
};

/** Nhóm menu admin: mỗi mục hiện khi admin có ít nhất một bộ quyền trong `any` */
type AdminMenuGroup = {
  title: string;
  items: Array<{ to: string; label: string; any: Permission[] }>;
};

/** Menu theo bộ quyền: admin chỉ thấy mục mình có quyền. Mục của các giai đoạn sau thêm khi tới giai đoạn. */
const GROUPS: AdminMenuGroup[] = [
  {
    title: 'Kiểm duyệt',
    items: [
      { to: '/quan-tri/duyet-shop', label: 'Duyệt shop', any: ['MODERATION'] },
      { to: '/quan-tri/shop', label: 'Quản lý shop', any: ['MODERATION'] },
      { to: '/quan-tri/danh-muc', label: 'Danh mục', any: ['MODERATION'] },
    ],
  },
  {
    title: 'Hỗ trợ',
    items: [{ to: '/quan-tri/don-hang', label: 'Đơn hàng', any: ['SUPPORT'] }],
  },
  {
    title: 'Tài chính',
    items: [
      { to: '/quan-tri/duyet-don', label: 'Duyệt đơn lớn', any: ['FINANCE'] },
      { to: '/quan-tri/hoan-tien', label: 'Hoàn tiền', any: ['FINANCE'] },
      { to: '/quan-tri/voucher', label: 'Voucher sàn', any: ['FINANCE'] },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { to: '/quan-tri/cau-hinh', label: 'Cấu hình chính sách', any: ['SYSTEM', 'FINANCE'] },
      { to: '/quan-tri/nguoi-dung', label: 'Người dùng và quyền', any: ['SYSTEM'] },
      { to: '/quan-tri/nhat-ky', label: 'Nhật ký thao tác', any: ['SYSTEM'] },
    ],
  },
];

/** Menu của một admin: bỏ mục không có quyền, bỏ nhóm rỗng */
function menuFor(perms: Permission[]): ConsoleMenuGroup[] {
  return GROUPS.map((g) => ({
    title: g.title,
    items: g.items.filter((i) => i.any.some((p) => perms.includes(p))),
  })).filter((g) => g.items.length > 0);
}

/** Trang đầu tiên admin được vào (dùng khi mở /quan-tri) */
export function firstAdminPage(perms: Permission[]): string {
  return menuFor(perms)[0]?.items[0]?.to ?? '/';
}

export function AdminLayout() {
  const user = useCurrentUser();
  const perms = user?.permissions ?? [];
  return (
    <ConsoleLayout
      area="Quản trị"
      tone="admin"
      menu={menuFor(perms)}
      headerInfo={<>Quyền: {perms.map((p) => PERMISSION_LABELS[p]).join(' · ')}</>}
      menuNote="Đối soát, rút tiền, tranh chấp có từ giai đoạn sau."
    />
  );
}
