import { CalendarClock, Store, Ticket, UserRound } from 'lucide-react';
import { StatusBadge } from '@/components/status-badge';
import type { Voucher } from '@/lib/catalog-types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { discountShort, discountText, minOrderText, VOUCHER_STATE } from './voucher-utils';

export type VoucherKind = 'shop' | 'platform';

/** Phần vé voucher có thể là bản xem trước (chưa có id, số lượt đã dùng) */
export type TicketData = Pick<
  Voucher,
  | 'code'
  | 'name'
  | 'discountType'
  | 'value'
  | 'maxDiscount'
  | 'minOrder'
  | 'startAt'
  | 'endAt'
  | 'quantity'
  | 'perUserLimit'
> &
  Partial<Pick<Voucher, 'usedCount' | 'state'>>;

/**
 * Cuống vé bên trái (nền navy, mức giảm chữ champagne) có răng cưa ở mép, giống phiếu giảm giá giấy.
 * `notch`: màu nền phía sau để khoét hai nửa hình tròn.
 */
function Stub({
  v,
  kind,
  dim,
  compact,
}: {
  v: TicketData;
  kind: VoucherKind;
  dim?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center gap-3 overflow-hidden text-center',
        compact ? 'w-28 flex-col gap-1 px-3 py-4' : 'px-5 py-4 sm:w-40 sm:flex-col sm:gap-1.5',
        dim ? 'bg-navy/45' : 'bg-navy',
      )}
    >
      {/* họa tiết chéo mờ cho cuống vé */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07] [background:repeating-linear-gradient(135deg,white_0_2px,transparent_2px_12px)]"
      />
      <span className="relative flex size-8 items-center justify-center rounded-full bg-white/10 text-champagne ring-1 ring-champagne/40">
        {kind === 'shop' ? <Store className="size-4" /> : <Ticket className="size-4" />}
      </span>
      <div className="relative">
        <div
          className={cn(
            'leading-none font-bold tracking-tight text-champagne tabular-nums',
            compact ? 'text-2xl' : 'text-2xl sm:text-[28px]',
          )}
        >
          {discountShort(v)}
        </div>
        <div className="mt-1 text-[10px] font-medium tracking-[0.14em] text-white/70 uppercase">
          {kind === 'shop' ? 'Voucher shop' : 'Voucher sàn'}
        </div>
      </div>
    </div>
  );
}

/** Đường răng cưa giữa cuống và thân vé (dọc trên máy tính, ngang trên điện thoại) */
function Perforation({ compact }: { compact?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn('relative shrink-0 bg-white', compact ? 'w-0' : 'h-0 sm:h-auto sm:w-0')}
    >
      <span
        className={cn(
          'absolute size-4 rounded-full border bg-ivory',
          compact ? '-top-2 -left-2' : '-top-2 -left-2 hidden sm:block',
        )}
      />
      <span
        className={cn(
          'absolute size-4 rounded-full border bg-ivory',
          compact ? '-bottom-2 -left-2' : '-bottom-2 -left-2 hidden sm:block',
        )}
      />
    </div>
  );
}

/** Thanh "Đã dùng 12/200" */
export function UsageBar({ used, quantity }: { used: number; quantity: number }) {
  const pct = quantity > 0 ? Math.min(100, Math.round((used / quantity) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Đã dùng</span>
        <span className="text-ink tabular-nums">
          <b className="font-semibold">{used.toLocaleString('vi-VN')}</b>/
          {quantity.toLocaleString('vi-VN')}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ivory-200">
        <div
          className={cn('h-full rounded-full', pct >= 90 ? 'bg-red-500' : 'bg-champagne')}
          style={{ width: `${Math.max(pct, used > 0 ? 3 : 0)}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Một voucher dạng vé: cuống (mức giảm) + thân (mã, tên, điều kiện, thời gian, lượt dùng) + nút.
 * Dùng cho danh sách voucher shop, voucher sàn và bản xem trước trong form.
 */
export function VoucherTicket({
  v,
  kind,
  actions,
  className,
}: {
  v: TicketData;
  kind: VoucherKind;
  actions?: React.ReactNode;
  className?: string;
}) {
  const ended = v.state === 'ENDED';
  const state = v.state ? VOUCHER_STATE[v.state] : null;
  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-white shadow-xs transition sm:flex-row',
        !ended && 'hover:border-champagne/60 hover:shadow-sm',
        className,
      )}
    >
      <Stub v={v} kind={kind} dim={ended} />
      <Perforation />
      <div className="flex min-w-0 flex-1 flex-col gap-4 border-dashed p-4 sm:border-l-2 md:flex-row md:items-center md:gap-6 md:p-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md bg-champagne-50 px-2 py-0.5 font-mono text-sm font-semibold tracking-wider text-navy ring-1 ring-champagne/40 ring-inset">
              {v.code || 'MÃ VOUCHER'}
            </code>
            {state && <StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
          </div>
          <h3 className={cn('mt-2 font-semibold break-words', ended ? 'text-ink/60' : 'text-ink')}>
            {v.name || 'Tên voucher'}
          </h3>
          <p className={cn('mt-0.5 text-sm font-medium', ended ? 'text-ink/60' : 'text-navy')}>
            {discountText(v)} <span className="text-muted-foreground">·</span>{' '}
            <span className="font-normal text-muted-foreground">{minOrderText(v.minOrder)}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5 text-champagne-600" />
              {formatDateTime(v.startAt)} – {formatDateTime(v.endAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5 text-champagne-600" />
              Mỗi người {v.perUserLimit} lần
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-3 md:w-56 md:shrink-0">
          <UsageBar used={v.usedCount ?? 0} quantity={v.quantity} />
          {actions && <div className="flex flex-wrap gap-2 md:justify-end">{actions}</div>}
        </div>
      </div>
    </article>
  );
}

/** Vé nhỏ xem trước trong form (luôn nằm ngang) */
export function VoucherPreview({ v, kind }: { v: TicketData; kind: VoucherKind }) {
  return (
    <div className="flex overflow-hidden rounded-xl border bg-white shadow-xs">
      <Stub v={v} kind={kind} compact />
      <Perforation compact />
      <div className="min-w-0 flex-1 border-l-2 border-dashed px-4 py-3">
        <code className="font-mono text-sm font-semibold tracking-wider text-navy">
          {v.code || 'MÃ VOUCHER'}
        </code>
        <div className="mt-0.5 truncate text-sm font-medium text-ink">
          {v.name || 'Tên voucher'}
        </div>
        <div className="mt-0.5 text-xs text-navy">{discountText(v)}</div>
        <div className="text-xs text-muted-foreground">{minOrderText(v.minOrder)}</div>
      </div>
    </div>
  );
}
