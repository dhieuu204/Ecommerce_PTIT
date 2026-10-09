import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock3,
  Info,
  Loader2,
  Lock,
  LockOpen,
  Mail,
  MonitorSmartphone,
  Phone,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { PERMISSION_LABELS } from '@/components/layout/admin-layout';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SheetClose } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import type { AdminUserDetail } from '@/lib/admin-types';
import { API, api, ApiError, refreshSession } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDate, formatDateTime } from '@/lib/format';
import { showApiError } from '@/lib/form';
import type { Permission } from '@/lib/types';
import { cn } from '@/lib/utils';
import { UserStatusBadge } from './labels';

const REASON_MAX = 500;
const ALL_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[];

/** Việc mỗi bộ quyền được làm (chữ hiển thị) */
const PERMISSION_HINTS: Record<Permission, string> = {
  MODERATION: 'Duyệt shop, xử lý vi phạm',
  SUPPORT: 'Tra cứu đơn, hỗ trợ trả hàng',
  FINANCE: 'Đối soát, hoàn tiền, duyệt rút tiền',
  SYSTEM: 'Người dùng, bộ quyền, nhật ký',
};

const userKey = (id: string) => ['admin', 'users', 'detail', id] as const;

/** Bảng chi tiết một người dùng (mở bên phải trang Người dùng và quyền) */
export function UserDetailPanel({ userId }: { userId: string }) {
  const me = useCurrentUser();
  const query = useQuery({
    queryKey: userKey(userId),
    queryFn: () => api<AdminUserDetail>(`${API.user}/admin/users/${userId}`),
  });

  if (query.isPending) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-60" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <LoadError
        className="mt-10"
        message={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  }
  const u = query.data;
  const isMe = me?.id === u.id;

  return (
    <div>
      <div className="relative overflow-hidden bg-navy px-6 pt-8 pb-6 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-20 -right-10 size-56 rounded-full bg-champagne/20 blur-3xl"
        />
        <SheetClose
          className="absolute top-3 right-3 rounded-full p-1.5 text-white/70 transition hover:bg-white/10 hover:text-white"
          aria-label="Đóng"
        >
          <X className="size-5" />
        </SheetClose>
        <div className="relative flex items-center gap-4">
          <UserAvatar name={u.fullName} className="size-14 text-base ring-champagne/60" />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {u.fullName}
              {isMe && <span className="ml-2 text-xs font-normal text-champagne">(bạn)</span>}
            </div>
            <div className="truncate text-sm text-white/70">{u.email}</div>
            <div className="mt-2">
              <UserStatusBadge status={u.status} />
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        <dl className="grid gap-3 rounded-2xl border bg-card p-4 text-sm">
          <Info2 icon={Mail} label="Email" value={u.email} />
          <Info2 icon={Phone} label="Số điện thoại" value={u.phone ?? 'Chưa có'} />
          <Info2 icon={CalendarDays} label="Đăng ký" value={formatDate(u.createdAt)} />
          <Info2
            icon={Clock3}
            label="Đăng nhập gần nhất"
            value={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Chưa đăng nhập'}
          />
          <Info2
            icon={MonitorSmartphone}
            label="Đang đăng nhập"
            value={
              <span className={cn(u.activeSessions > 0 && 'font-medium text-emerald-700')}>
                {u.activeSessions > 0 ? `${u.activeSessions} thiết bị` : 'Không có'}
              </span>
            }
          />
          <Info2
            icon={ShieldCheck}
            label="Đăng nhập Google"
            value={u.hasGoogle ? 'Đã liên kết' : 'Chưa liên kết'}
          />
        </dl>

        {u.status === 'LOCKED' && u.lockReason && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <div className="font-semibold">Tài khoản đang bị khóa</div>
            <p className="mt-0.5">Lý do: {u.lockReason}</p>
          </div>
        )}

        <PermissionsForm user={u} isMe={isMe} />
        <LockSection user={u} isMe={isMe} />
      </div>
    </div>
  );
}

function Info2({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-champagne-600" />
      <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-ink">{value}</dd>
    </div>
  );
}

/** Sau khi đổi: cập nhật bảng chi tiết và danh sách */
function useApplyResult() {
  const queryClient = useQueryClient();
  return (result: AdminUserDetail) => {
    queryClient.setQueryData(userKey(result.id), result);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'], exact: false });
  };
}

function PermissionsForm({ user, isMe }: { user: AdminUserDetail; isMe: boolean }) {
  const apply = useApplyResult();
  const [perms, setPerms] = useState<Permission[]>(user.permissions);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPerms(user.permissions);
    setReason('');
    setError(null);
  }, [user.id, user.permissions]);

  const changed =
    perms.length !== user.permissions.length || perms.some((p) => !user.permissions.includes(p));
  const removing = user.permissions.some((p) => !perms.includes(p));

  async function save() {
    const text = reason.trim();
    if (!text) {
      setError('Vui lòng nhập lý do.');
      return;
    }
    if (text.length > REASON_MAX) {
      setError(`Lý do tối đa ${REASON_MAX} ký tự.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<AdminUserDetail>(`${API.user}/admin/users/${user.id}/permissions`, {
        method: 'PUT',
        body: { permissions: ALL_PERMISSIONS.filter((p) => perms.includes(p)), reason: text },
      });
      apply(result);
      toast.success('Đã lưu bộ quyền.');
      // Đổi quyền của chính mình: lấy vé mới để menu quản trị cập nhật ngay
      if (isMe) void refreshSession();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CANNOT_REMOVE_OWN_SYSTEM') {
        setError(e.message);
        setPerms((cur) => (cur.includes('SYSTEM') ? cur : [...cur, 'SYSTEM']));
      } else if (e instanceof ApiError && e.fields.reason) {
        setError(e.fields.reason);
      } else {
        showApiError(e);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="flex items-center gap-2 font-semibold text-navy">
        <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
        Bộ quyền quản trị
      </h3>
      <ul className="mt-3 divide-y rounded-xl border">
        {ALL_PERMISSIONS.map((p) => {
          const locked = isMe && p === 'SYSTEM';
          const id = `perm-${p}`;
          return (
            <li key={p}>
              <label
                htmlFor={id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 px-3 py-2.5 transition hover:bg-ivory',
                  locked && 'cursor-not-allowed opacity-70',
                )}
              >
                <Checkbox
                  id={id}
                  className="mt-0.5"
                  checked={perms.includes(p)}
                  disabled={locked || busy}
                  onCheckedChange={(v) =>
                    setPerms((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{PERMISSION_LABELS[p]}</span>
                  <span className="block text-xs text-muted-foreground">
                    {locked ? 'Bạn không thể tự bỏ quyền Hệ thống của mình' : PERMISSION_HINTS[p]}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {changed && (
        <div className="mt-3 space-y-2">
          {removing && (
            <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Info className="mt-px size-3.5 shrink-0" />
              Bỏ bớt quyền sẽ đăng xuất người này ở mọi nơi. Vé đăng nhập hiện tại còn hiệu lực tối
              đa 15 phút.
            </p>
          )}
          <label htmlFor="perm-reason" className="text-sm font-medium text-ink">
            Lý do thay đổi<span className="text-destructive">*</span>
          </label>
          <Textarea
            id="perm-reason"
            rows={2}
            value={reason}
            aria-invalid={!!error}
            placeholder="Ví dụ: Thêm người kiểm duyệt shop"
            className="rounded-lg bg-white focus-visible:border-champagne"
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        {changed && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setPerms(user.permissions);
              setReason('');
              setError(null);
            }}
          >
            Hoàn tác
          </Button>
        )}
        <Button
          className="flex-1 rounded-full"
          disabled={!changed || busy}
          onClick={() => void save()}
        >
          {busy && <Loader2 className="animate-spin" />}
          Lưu bộ quyền
        </Button>
      </div>
    </section>
  );
}

function LockSection({ user, isMe }: { user: AdminUserDetail; isMe: boolean }) {
  const apply = useApplyResult();
  const queryClient = useQueryClient();
  const locked = user.status === 'LOCKED';
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const text = reason.trim();
    if (!text) {
      setError('Vui lòng nhập lý do.');
      return;
    }
    if (text.length > REASON_MAX) {
      setError(`Lý do tối đa ${REASON_MAX} ký tự.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<AdminUserDetail>(
        `${API.user}/admin/users/${user.id}/${locked ? 'unlock' : 'lock'}`,
        { method: 'POST', body: { reason: text } },
      );
      apply(result);
      toast.success(locked ? 'Đã mở khóa tài khoản.' : 'Đã khóa tài khoản.');
      setOpen(false);
    } catch (e) {
      if (
        e instanceof ApiError &&
        ['CANNOT_LOCK_SELF', 'ALREADY_LOCKED', 'NOT_LOCKED'].includes(e.code)
      ) {
        toast.error(e.message);
        setOpen(false);
        void queryClient.invalidateQueries({ queryKey: userKey(user.id) });
      } else if (e instanceof ApiError && e.fields.reason) {
        setError(e.fields.reason);
      } else {
        showApiError(e);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={cn(
        'rounded-2xl border p-4',
        locked ? 'border-emerald-200 bg-card' : 'border-red-200 bg-card',
      )}
    >
      <h3 className="flex items-center gap-2 font-semibold text-navy">
        <span className={cn('h-4 w-1 rounded-full', locked ? 'bg-emerald-500' : 'bg-red-500')} />
        {locked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {locked
          ? 'Người này đăng nhập lại được. Cần nhập lý do.'
          : 'Đăng xuất người này ở mọi nơi; khi đăng nhập sẽ thấy "Tài khoản đã bị khóa". Cần nhập lý do.'}
      </p>
      {isMe && !locked ? (
        <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          Bạn không thể tự khóa tài khoản của mình.
        </p>
      ) : (
        <Button
          variant="outline"
          className={cn(
            'mt-3 w-full rounded-full',
            locked
              ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
              : 'border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800',
          )}
          onClick={() => {
            setReason('');
            setError(null);
            setOpen(true);
          }}
        >
          {locked ? <LockOpen /> : <Lock />}
          {locked ? 'Mở khóa tài khoản…' : 'Khóa tài khoản…'}
        </Button>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className={locked ? 'text-navy' : 'text-red-700'}>
              {locked ? 'Mở khóa' : 'Khóa'} tài khoản {user.fullName}
            </DialogTitle>
            <DialogDescription>
              {locked
                ? 'Tài khoản đã từng đăng nhập sẽ hoạt động lại ngay; tài khoản chưa xác minh email cần nhập mã như mới đăng ký.'
                : 'Mọi phiên đăng nhập của người này bị thu hồi ngay.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor="lock-reason" className="text-sm font-medium text-ink">
              Lý do<span className="text-destructive">*</span>
            </label>
            <Textarea
              id="lock-reason"
              rows={3}
              autoFocus
              value={reason}
              aria-invalid={!!error}
              placeholder={locked ? 'Ví dụ: Đã xác minh lại chủ tài khoản' : 'Ví dụ: Spam đơn ảo'}
              className="rounded-lg bg-white focus-visible:border-champagne"
              onChange={(e) => {
                setReason(e.target.value);
                setError(null);
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={busy}
              onClick={() => void submit()}
              className={cn('min-w-36', !locked && 'bg-red-600 hover:bg-red-700')}
            >
              {busy && <Loader2 className="animate-spin" />}
              {locked ? 'Xác nhận mở khóa' : 'Xác nhận khóa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
