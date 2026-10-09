import { StatusBadge } from '@/components/status-badge';
import type { ApprovalStatus, ApprovalType, UserStatus } from '@/lib/admin-types';
import { elapsed } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Hồ sơ chờ quá số giờ này thì tô đỏ cột "Đã chờ" (chỉ để admin chú ý, P1 không có hạn tự động) */
export const OVERDUE_HOURS = 24;

export const APPROVAL_STATUS: Record<
  ApprovalStatus,
  { label: string; tone: 'pending' | 'success' | 'danger' | 'neutral' }
> = {
  PENDING: { label: 'Chờ duyệt', tone: 'pending' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  REPLACED: { label: 'Đã bị thay', tone: 'neutral' },
};

export const APPROVAL_TYPE: Record<ApprovalType, string> = {
  REGISTER: 'Mở shop',
  CHANGE: 'Đổi thông tin',
};

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  const s = APPROVAL_STATUS[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Nhãn loại hồ sơ: Mở shop (champagne), Đổi thông tin (xanh) */
export function ApprovalTypeBadge({ type }: { type: ApprovalType }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        type === 'REGISTER' ? 'bg-champagne-50 text-champagne-600' : 'bg-blue-50 text-blue-700',
      )}
    >
      {APPROVAL_TYPE[type]}
    </span>
  );
}

export const USER_STATUS: Record<
  UserStatus,
  { label: string; tone: 'pending' | 'success' | 'danger' | 'neutral' }
> = {
  ACTIVE: { label: 'Hoạt động', tone: 'success' },
  UNVERIFIED: { label: 'Chưa xác minh', tone: 'neutral' },
  LOCKED: { label: 'Bị khóa', tone: 'danger' },
};

export function UserStatusBadge({ status }: { status: UserStatus }) {
  const s = USER_STATUS[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Số giờ từ một thời điểm tới giờ */
export const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

/** Thời gian đã chờ: dưới 48 giờ ghi theo giờ ("26 giờ") để admin thấy rõ mốc 24 giờ */
export function waited(iso: string): string {
  const h = hoursSince(iso);
  if (h >= 1 && h < 48) return `${Math.floor(h)} giờ`;
  return elapsed(iso);
}
