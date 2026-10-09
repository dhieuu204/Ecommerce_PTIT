import { useCurrentUser } from '@/lib/auth';
import type { Permission } from '@/lib/types';
import { ConsoleLayout, type ConsoleMenuGroup } from './console-layout';

export const PERMISSION_LABELS: Record<Permission, string> = {
  MODERATION: 'Kiểm duyệt',
  SUPPORT: 'Hỗ trợ',
  FINANCE: 'Tài chính / rủi ro',
  SYSTEM: 'Hệ thống',
};

/** Menu theo bộ quyền: admin chỉ thấy nhóm mình có quyền. Mục của P2 trở đi thêm khi tới giai đoạn. */
const GROUPS: Array<ConsoleMenuGroup & { permission: Permission }> = [
  {
    permission: 'MODERATION',
    title: 'Kiểm duyệt',
    items: [{ to: '/quan-tri/duyet-shop', label: 'Duyệt shop' }],
  },
  {
    permission: 'SYSTEM',
    title: 'Hệ thống',
    items: [
      { to: '/quan-tri/nguoi-dung', label: 'Người dùng và quyền' },
      { to: '/quan-tri/nhat-ky', label: 'Nhật ký thao tác' },
    ],
  },
];

/** Trang đầu tiên admin được vào (dùng khi mở /quan-tri) */
export function firstAdminPage(perms: Permission[]): string {
  return GROUPS.find((g) => perms.includes(g.permission))?.items[0]?.to ?? '/';
}

export function AdminLayout() {
  const user = useCurrentUser();
  const perms = user?.permissions ?? [];
  return (
    <ConsoleLayout
      area="Quản trị"
      tone="admin"
      menu={GROUPS.filter((g) => perms.includes(g.permission))}
      headerInfo={<>Quyền: {perms.map((p) => PERMISSION_LABELS[p]).join(' · ')}</>}
      menuNote="Hỗ trợ, Tài chính và các mục khác có từ giai đoạn sau."
    />
  );
}
