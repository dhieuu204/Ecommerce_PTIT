import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarCheck,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  History,
  Landmark,
  Loader2,
  Mail,
  MapPin,
  Package,
  Phone,
  RotateCcw,
  ShieldAlert,
  Store,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { SectionCard } from '@/components/console/form-field';
import { ShopLogo } from '@/components/console/shop-logo';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { AdminShopDetail, AdminShopStatus, ShopViolations } from '@/lib/catalog-types';
import { formatDate, formatDateTime, maskAccount } from '@/lib/format';
import { showApiError } from '@/lib/form';
import { cn } from '@/lib/utils';
import { shortId, useShopOwners } from './shop-owners';
import { adminShopsKey, ShopStatusBadge } from './shops';

const REASON_MIN = 5;
const REASON_MAX = 500;
/** Chờ marketplace áp quyết định (nhận sự kiện) tối đa bao lâu trước khi báo "chưa thấy áp dụng" */
const APPLY_TIMEOUT_MS = 30_000;
const QUICK_REASONS = {
  SUSPEND: [
    'Bán hàng giả, hàng nhái',
    'Thông tin sản phẩm sai sự thật',
    'Nhiều khiếu nại của người mua chưa xử lý',
  ],
  RESTORE: ['Shop đã khắc phục vi phạm', 'Đã xác minh lại thông tin shop'],
};

const detailKey = (id: string) => [...adminShopsKey, 'detail', id] as const;
const violationsKey = (id: string) => [...adminShopsKey, 'violations', id] as const;

type Action = 'SUSPEND' | 'RESTORE';

/**
 * Quản trị › Quản lý shop › Chi tiết (SHP-04): thông tin shop, số sản phẩm, lịch sử đình chỉ;
 * đình chỉ / khôi phục qua approval-service. Quyết định được marketplace áp dụng qua sự kiện nên
 * trang tải lại tới khi trạng thái đổi.
 */
export function ShopDetailPage() {
  const { shopId = '' } = useParams();
  const queryClient = useQueryClient();
  const user = useCurrentUser();
  const owners = useShopOwners();
  // Quyết định vừa gửi, đang chờ marketplace áp dụng
  const [pending, setPending] = useState<{ expect: AdminShopStatus; since: number } | null>(null);
  const [slow, setSlow] = useState(false);
  const [dialog, setDialog] = useState<Action | null>(null);

  const shop = useQuery({
    queryKey: detailKey(shopId),
    queryFn: () => api<AdminShopDetail>(`${API.market}/admin/shops/${shopId}`),
    refetchInterval: pending ? 1500 : false,
  });
  const violations = useQuery({
    queryKey: violationsKey(shopId),
    queryFn: () => api<ShopViolations>(`${API.approval}/admin/shops/${shopId}/violations`),
  });

  // Trạng thái đã đổi đúng như quyết định: báo xong
  useEffect(() => {
    if (!pending || !shop.data) return;
    if (shop.data.status === pending.expect) {
      setPending(null);
      setSlow(false);
      void queryClient.invalidateQueries({ queryKey: adminShopsKey });
      toast.success(
        pending.expect === 'SUSPENDED'
          ? 'Đã đình chỉ shop: hàng của shop đã ẩn khỏi sàn.'
          : 'Đã khôi phục shop: hàng của shop hiện lại trên sàn.',
      );
    }
  }, [shop.data, pending, queryClient]);
  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(
      () => setSlow(true),
      Math.max(0, pending.since + APPLY_TIMEOUT_MS - Date.now()),
    );
    return () => clearTimeout(t);
  }, [pending]);

  const crumbs = [
    { label: 'Kiểm duyệt' },
    { label: 'Quản lý shop', to: '/quan-tri/shop' },
    { label: shop.data?.name ?? 'Chi tiết shop' },
  ];

  if (shop.isPending) return <DetailSkeleton />;
  if (shop.isError) {
    const notFound = shop.error instanceof ApiError && shop.error.status === 404;
    return (
      <div className="mx-auto max-w-6xl">
        <PageHeader crumbs={crumbs} title="Chi tiết shop" />
        <div className="rounded-2xl border bg-card">
          {notFound ? (
            <EmptyState
              icon={Store}
              title="Không tìm thấy shop"
              text="Shop không có hoặc chưa được duyệt."
              action={
                <Button asChild variant="outline">
                  <Link to="/quan-tri/shop">Về danh sách shop</Link>
                </Button>
              }
            />
          ) : (
            <LoadError message={shop.error.message} onRetry={() => void shop.refetch()} />
          )}
        </div>
      </div>
    );
  }

  const s = shop.data;
  const owner = owners.data?.get(s.id);
  const isOwner = !!user && user.id === s.ownerId;
  const suspended = s.status === 'SUSPENDED';
  const action: Action = suspended ? 'RESTORE' : 'SUSPEND';

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={crumbs}
        title={s.name}
        actions={
          <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
            <Link to="/quan-tri/shop">
              <ArrowLeft /> Danh sách
            </Link>
          </Button>
        }
      />

      {/* Đầu trang: logo, trạng thái, nút quyết định */}
      <div className="mb-6 flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm shadow-navy/[0.03] sm:flex-row sm:items-center md:p-5">
        <ShopLogo url={s.logoUrl} className="size-16 border" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShopStatusBadge status={s.status} />
            <span className="font-mono text-xs text-muted-foreground" title={s.id}>
              {shortId(s.id)}
            </span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarCheck className="size-4 text-champagne-600" />
              Duyệt {formatDate(s.approvedAt) || '—'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Package className="size-4 text-champagne-600" />
              {s.productCount.toLocaleString('vi-VN')} sản phẩm
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full border-navy/30 text-navy">
              <Link to={`/shop/${s.id}`} target="_blank" rel="noreferrer">
                <ExternalLink /> Trang shop
              </Link>
            </Button>
            <Button
              className={cn(
                'rounded-full px-5',
                action === 'SUSPEND' && 'bg-red-600 text-white hover:bg-red-700',
              )}
              disabled={isOwner || !!pending}
              onClick={() => setDialog(action)}
            >
              {action === 'SUSPEND' ? <ShieldAlert /> : <RotateCcw />}
              {action === 'SUSPEND' ? 'Đình chỉ shop' : 'Khôi phục shop'}
            </Button>
          </div>
          {isOwner && (
            <p className="text-xs text-red-700">Bạn là chủ shop này nên không tự xử lý được.</p>
          )}
        </div>
      </div>

      {pending && (
        <div
          role="status"
          className={cn(
            'mb-6 flex gap-3 rounded-2xl border p-4 text-sm',
            slow
              ? 'border-amber-200 bg-amber-50 text-amber-950'
              : 'border-champagne/50 bg-champagne-50/70 text-navy',
          )}
        >
          {slow ? (
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700" />
          ) : (
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-champagne-600" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {slow ? 'Quyết định đã lưu, chưa thấy áp dụng' : 'Đã gửi quyết định, đang áp dụng…'}
            </div>
            <p className="mt-0.5 text-muted-foreground">
              {slow
                ? 'Sàn sẽ áp dụng khi nhận được quyết định (thường vài giây). Bạn có thể tải lại sau.'
                : pending.expect === 'SUSPENDED'
                  ? 'Đang ẩn hàng của shop khỏi sàn.'
                  : 'Đang hiện lại hàng của shop trên sàn.'}
            </p>
          </div>
          {slow && (
            <Button
              size="sm"
              variant="outline"
              className="self-start rounded-full"
              onClick={() => {
                setSlow(false);
                setPending({ ...pending, since: Date.now() });
              }}
            >
              Kiểm tra lại
            </Button>
          )}
        </div>
      )}

      {suspended && !pending && (
        <div className="mb-6 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-950">
          <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div className="min-w-0">
            <div className="font-semibold">Shop đang bị đình chỉ</div>
            {s.suspendReason && (
              <p className="mt-0.5 break-words">
                <span className="font-medium">Lý do:</span> {s.suspendReason}
              </p>
            )}
            <p className="mt-1 text-xs text-red-900/70">
              Hàng của shop đang ẩn khỏi sàn; seller vẫn sửa được sản phẩm, tồn kho và voucher.
              {s.moderatedAt && <> Áp dụng lúc {formatDateTime(s.moderatedAt)}.</>}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat icon={Eye} label="Đang bán" value={s.productCounts.ACTIVE} tone="emerald" />
            <Stat icon={EyeOff} label="Đã ẩn" value={s.productCounts.HIDDEN} tone="muted" />
            <Stat icon={ShieldAlert} label="Bị gỡ" value={s.productCounts.REMOVED} tone="red" />
            <Stat icon={Package} label="Tổng sản phẩm" value={s.productCount} tone="navy" />
          </div>
          {suspended && s.productCounts.ACTIVE > 0 && (
            <p className="-mt-3 text-xs text-muted-foreground">
              Sản phẩm "Đang bán" của shop bị đình chỉ vẫn tạm ẩn với người mua.
            </p>
          )}
          <InfoCard shop={s} />
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-navy/[0.03]">
            <h2 className="flex items-center gap-2 font-semibold text-navy">
              <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
              Chủ shop
            </h2>
            <div className="mt-4 space-y-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <UserRound className="size-4 shrink-0 text-champagne-600" />
                <span className="truncate font-medium text-ink">
                  {owner?.ownerName ?? 'Chưa rõ tên'}
                </span>
              </div>
              {owner && (
                <div className="flex items-center gap-2.5">
                  <Mail className="size-4 shrink-0 text-champagne-600" />
                  <span className="truncate text-muted-foreground">{owner.ownerEmail}</span>
                </div>
              )}
              <div className="font-mono text-xs break-all text-muted-foreground">
                Mã: {s.ownerId}
              </div>
              {owner && (
                <Link
                  to={`/quan-tri/duyet-shop/${owner.approvalId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
                >
                  <FileText className="size-3.5" /> Xem hồ sơ mở shop
                </Link>
              )}
            </div>
          </section>
          <ViolationHistory query={violations} />
        </aside>
      </div>

      <DecisionDialog
        shop={s}
        action={dialog}
        onClose={() => setDialog(null)}
        onDecided={(result, act) => {
          queryClient.setQueryData(violationsKey(s.id), result);
          setDialog(null);
          setSlow(false);
          setPending({ expect: act === 'SUSPEND' ? 'SUSPENDED' : 'ACTIVE', since: Date.now() });
          void shop.refetch();
        }}
        onStale={() => {
          setDialog(null);
          void shop.refetch();
          void violations.refetch();
        }}
      />
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  tone: 'emerald' | 'muted' | 'navy' | 'red';
}) {
  return (
    <div className="rounded-2xl border bg-card p-3 shadow-sm shadow-navy/[0.03] sm:p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon
          className={cn(
            'size-3.5',
            tone === 'emerald' && 'text-emerald-600',
            tone === 'navy' && 'text-champagne-600',
            tone === 'red' && 'text-red-600',
          )}
        />
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums sm:text-2xl',
          tone === 'emerald'
            ? 'text-emerald-700'
            : tone === 'navy'
              ? 'text-navy'
              : tone === 'red'
                ? 'text-red-700'
                : 'text-ink/70',
        )}
      >
        {value.toLocaleString('vi-VN')}
      </div>
    </div>
  );
}

function InfoCard({ shop: s }: { shop: AdminShopDetail }) {
  const rows: Array<{ icon: typeof Store; label: string; value: React.ReactNode }> = [
    {
      icon: FileText,
      label: 'Mô tả',
      value: <span className="whitespace-pre-line">{s.description || '—'}</span>,
    },
    { icon: Phone, label: 'SĐT shop', value: s.phone || '—' },
    { icon: MapPin, label: 'Lấy hàng', value: s.pickupAddress || '—' },
    {
      icon: Landmark,
      label: 'Ngân hàng',
      value: s.bankAccount ? (
        <span className="flex flex-wrap gap-x-1.5">
          <span className="whitespace-nowrap">{s.bankAccount.bankName}</span>·
          <span className="font-mono whitespace-nowrap">
            {maskAccount(s.bankAccount.accountNumber)}
          </span>
          ·<span className="whitespace-nowrap">{s.bankAccount.accountName}</span>
        </span>
      ) : (
        '—'
      ),
    },
    { icon: CalendarCheck, label: 'Ngày duyệt', value: formatDateTime(s.approvedAt) || '—' },
  ];
  return (
    <SectionCard title="Thông tin shop" description="Thông tin shop đang dùng trên sàn.">
      <dl className="divide-y">
        {rows.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="grid gap-1 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[130px_1fr]"
          >
            <dt className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4 text-champagne-600" /> {label}
            </dt>
            <dd className="text-sm break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 rounded-lg bg-ivory px-3 py-2 text-xs text-muted-foreground">
        Số tài khoản chỉ hiện 4 số cuối. Số đầy đủ xem ở hồ sơ duyệt shop.
      </p>
    </SectionCard>
  );
}

/** Lịch sử đình chỉ / khôi phục, mới nhất trước */
function ViolationHistory({ query }: { query: UseQueryResult<ShopViolations> }) {
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm shadow-navy/[0.03]">
      <h2 className="flex items-center gap-2 font-semibold text-navy">
        <span className="h-4 w-1 rounded-full bg-champagne" aria-hidden />
        Lịch sử đình chỉ
      </h2>
      {query.isPending ? (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : query.isError ? (
        <LoadError
          className="py-6"
          message={query.error.message}
          onRetry={() => void query.refetch()}
        />
      ) : query.data.items.length === 0 ? (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl bg-ivory px-3 py-3 text-sm text-muted-foreground">
          <History className="size-4 text-champagne-600" />
          Shop chưa từng bị đình chỉ.
        </div>
      ) : (
        <ol className="relative mt-4 space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
          {query.data.items.map((v) => {
            const suspend = v.action === 'SUSPEND';
            return (
              <li key={v.id} className="relative pl-6">
                <span
                  className={cn(
                    'absolute top-1.5 left-0 size-[11px] rounded-full ring-4',
                    suspend ? 'bg-red-500 ring-red-100' : 'bg-emerald-500 ring-emerald-100',
                  )}
                />
                <div
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold',
                    suspend ? 'text-red-700' : 'text-emerald-700',
                  )}
                >
                  {suspend ? 'Đình chỉ' : 'Khôi phục'}
                </div>
                <p className="mt-0.5 text-sm break-words text-ink">"{v.reason}"</p>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {v.decidedByName} · {formatDateTime(v.createdAt)}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** Đình chỉ / khôi phục: lý do bắt buộc 5–500 ký tự */
function DecisionDialog({
  shop,
  action,
  onClose,
  onDecided,
  onStale,
}: {
  shop: AdminShopDetail;
  action: Action | null;
  onClose: () => void;
  onDecided: (result: ShopViolations, action: Action) => void;
  /** Trạng thái đã đổi ở nơi khác (ALREADY_SUSPENDED / NOT_SUSPENDED) */
  onStale: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (action) {
      setReason('');
      setError(null);
    }
  }, [action]);
  const suspend = action === 'SUSPEND';

  async function submit() {
    if (!action) return;
    const text = reason.trim();
    if (text.length < REASON_MIN || text.length > REASON_MAX) {
      setError(`Lý do dài từ ${REASON_MIN} đến ${REASON_MAX} ký tự.`);
      return;
    }
    setBusy(true);
    try {
      const result = await api<ShopViolations>(
        `${API.approval}/admin/shops/${shop.id}/${suspend ? 'suspend' : 'restore'}`,
        { method: 'POST', body: { reason: text } },
      );
      onDecided(result, action);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'SELF_MODERATION_FORBIDDEN') {
          setError(e.message);
        } else if (e.code === 'ALREADY_SUSPENDED' || e.code === 'NOT_SUSPENDED') {
          toast.error(e.message);
          onStale();
        } else if (e.fields.reason) {
          setError(e.fields.reason);
        } else {
          showApiError(e);
        }
      } else showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!action} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader className="text-left">
          <DialogTitle className={cn('pr-6', suspend ? 'text-red-700' : 'text-navy')}>
            {suspend ? 'Đình chỉ shop' : 'Khôi phục shop'} "{shop.name}"
          </DialogTitle>
          <DialogDescription>
            {suspend
              ? 'Hàng của shop biến mất khỏi tìm kiếm, trang sản phẩm không mở được, dòng giỏ của người mua thành "Không còn bán". Seller vẫn vào Kênh người bán sửa hàng và thấy lý do bạn ghi.'
              : 'Hàng đang bán của shop hiện lại trên sàn ngay khi áp dụng.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label htmlFor="decision-reason" className="text-sm font-medium text-ink">
            Lý do<span className="text-destructive">*</span>
          </label>
          <Textarea
            id="decision-reason"
            rows={4}
            maxLength={REASON_MAX}
            value={reason}
            aria-invalid={!!error}
            placeholder={suspend ? 'Seller sẽ đọc lý do này.' : 'Ví dụ: Shop đã khắc phục vi phạm'}
            className="rounded-lg bg-white focus-visible:border-champagne"
            onChange={(e) => {
              setReason(e.target.value);
              setError(null);
            }}
          />
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {action &&
                QUICK_REASONS[action].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setReason(r);
                      setError(null);
                    }}
                    className="rounded-full border border-champagne/50 bg-champagne-50/60 px-2.5 py-1 text-xs text-navy transition hover:border-champagne hover:bg-champagne-50"
                  >
                    {r}
                  </button>
                ))}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {reason.trim().length}/{REASON_MAX}
            </span>
          </div>
          {error && (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Hủy
          </Button>
          <Button
            disabled={busy}
            onClick={() => void submit()}
            className={cn('min-w-36', suspend && 'bg-red-600 hover:bg-red-700')}
          >
            {busy && <Loader2 className="animate-spin" />}
            {suspend ? 'Đình chỉ shop' : 'Khôi phục shop'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
