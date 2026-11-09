import { IconCheck, IconMapPin, IconPlus, IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { shortValue, voucherDiscountText } from '@/components/catalog/voucher-ticket';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { VoucherOption } from '@/lib/order-types';
import type { Address } from '@/lib/types';
import { cn } from '@/lib/utils';

/** Thẻ trắng có bóng nhẹ, giống trang chủ và giỏ hàng */
export const CARD = 'rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,26,61,0.04)]';

/** Nút chính chuyển sắc cam */
export const PRIMARY_BUTTON =
  'rounded-lg bg-gradient-to-r from-header-from to-header-to font-bold text-white shadow-[0_12px_24px_-12px_rgba(238,77,45,0.7)] transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none';

/** Tiêu đề trong thẻ: gạch cam phía trước */
export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-base font-bold tracking-tight text-charcoal">
      <span aria-hidden className="h-[3px] w-5 shrink-0 rounded-full bg-navy" />
      {children}
    </h2>
  );
}

/** Dấu tick ở góc của ô đang chọn */
export function CornerTick() {
  return (
    <span className="absolute top-0 right-0 flex size-4 items-center justify-center rounded-tr-[7px] rounded-bl-md bg-navy text-white">
      <IconCheck className="size-3 [stroke-width:3]" />
    </span>
  );
}

/** Cuống vé cam, mép trái răng cưa (cùng kiểu với mã giảm giá ở trang chủ) */
export function TicketStub({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-header-from to-header-to text-white',
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-1.5 -left-[3px] flex flex-col justify-between">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="size-1.5 rounded-full bg-card" />
        ))}
      </span>
      {children}
    </span>
  );
}

/** Ô tròn đánh dấu lựa chọn trong hộp thoại */
function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border transition',
        on ? 'border-navy bg-navy text-white' : 'border-ink/25',
      )}
    >
      {on && <IconCheck className="size-3 [stroke-width:3]" />}
    </span>
  );
}

/** Chọn địa chỉ nhận hàng trong sổ địa chỉ (user-service) */
export function AddressDialog({
  open,
  onOpenChange,
  currentId,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentId: string | undefined;
  onPick: (id: string) => void;
}) {
  const list = useQuery({
    queryKey: ['me', 'addresses'],
    queryFn: () => api<Address[]>(`${API.user}/me/addresses`),
    enabled: open,
  });
  const [picked, setPicked] = useState(currentId);
  useEffect(() => {
    if (open) setPicked(currentId);
  }, [open, currentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-charcoal">Địa chỉ nhận hàng</DialogTitle>
          <DialogDescription className="sr-only">
            Chọn một địa chỉ trong sổ địa chỉ của bạn.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {list.isPending
            ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)
            : list.data?.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPicked(a.id)}
                  className={cn(
                    'flex w-full gap-3 rounded-lg border p-3 text-left transition',
                    picked === a.id
                      ? 'border-navy bg-champagne-50'
                      : 'border-ink/15 hover:border-navy/40',
                  )}
                >
                  <RadioDot on={picked === a.id} />
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-charcoal">{a.receiverName}</span>
                    <span className="text-ink/55"> · {a.phone}</span>
                    {a.isDefault && (
                      <span className="ml-2 rounded border border-navy/40 px-1.5 text-[11px] font-medium text-navy">
                        Mặc định
                      </span>
                    )}
                    <span className="mt-0.5 block leading-5 text-ink/65">
                      {[a.street, a.wardName, a.districtName, a.provinceName].join(', ')}
                    </span>
                  </span>
                </button>
              ))}
          <Link
            to="/tai-khoan/dia-chi"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-ink/20 p-3 text-sm font-semibold text-navy transition hover:border-navy/40 hover:bg-champagne-50"
          >
            <IconPlus className="size-4 [stroke-width:2]" /> Thêm địa chỉ mới
          </Link>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            disabled={!picked}
            onClick={() => {
              if (picked) onPick(picked);
              onOpenChange(false);
            }}
          >
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Chọn voucher (của một shop, hoặc voucher sàn). Voucher chưa đủ điều kiện vẫn hiện, mờ đi và ghi lý do.
 * Voucher sàn có thêm ô nhập mã.
 */
export function VoucherDialog({
  open,
  onOpenChange,
  title,
  options,
  current,
  allowCode,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  options: VoucherOption[];
  current: string | null;
  allowCode?: boolean;
  onPick: (code: string | null) => void;
}) {
  const [picked, setPicked] = useState<string | null>(current);
  const [code, setCode] = useState('');
  useEffect(() => {
    if (open) {
      setPicked(current);
      setCode('');
    }
  }, [open, current]);

  const apply = (value: string | null) => {
    onPick(value);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-charcoal">{title}</DialogTitle>
          <DialogDescription>Mỗi đơn chỉ áp được một mã.</DialogDescription>
        </DialogHeader>
        {allowCode && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (code.trim()) apply(code.trim().toUpperCase());
            }}
          >
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Nhập mã voucher"
              maxLength={20}
              className="h-10 uppercase"
              aria-label="Mã voucher"
            />
            <Button type="submit" variant="outline" className="h-10" disabled={!code.trim()}>
              Áp dụng
            </Button>
          </form>
        )}
        <div className="space-y-2.5">
          {options.length === 0 && (
            <p className="flex flex-col items-center gap-2 rounded-lg bg-page px-4 py-8 text-center text-sm text-ink/55">
              <IconTicket className="size-7 text-ink/30 [stroke-width:1.5]" />
              Hiện chưa có voucher nào.
            </p>
          )}
          {options.map((v) => (
            <button
              key={v.code}
              type="button"
              disabled={!v.eligible}
              onClick={() => setPicked(v.code)}
              className={cn(
                'flex w-full overflow-hidden rounded-lg border text-left transition disabled:cursor-not-allowed',
                picked === v.code
                  ? 'border-navy bg-champagne-50'
                  : 'border-ink/15 enabled:hover:border-navy/40',
                !v.eligible && 'opacity-55 grayscale',
              )}
            >
              <TicketStub className="w-[4.75rem] px-2 py-3">
                <span className="text-lg leading-none font-bold">{shortValue(v)}</span>
                <span className="mt-1 max-w-full truncate text-[10px] font-medium opacity-90">
                  {v.code}
                </span>
              </TicketStub>
              <span className="min-w-0 flex-1 px-3 py-2.5 text-sm">
                <span className="block font-semibold text-charcoal">{voucherDiscountText(v)}</span>
                <span className="mt-0.5 block text-xs text-ink/55">
                  Đơn từ {formatMoney(v.minOrder)} · HSD {formatDate(v.endAt)}
                </span>
                {v.eligible ? (
                  <span className="mt-0.5 block text-xs font-semibold text-navy">
                    Giảm {formatMoney(v.discount)} cho đơn này
                  </span>
                ) : (
                  <span className="mt-0.5 block text-xs text-red-600">{v.reason}</span>
                )}
              </span>
              <span className="flex items-center pr-3">
                <RadioDot on={picked === v.code} />
              </span>
            </button>
          ))}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => apply(null)}>
            Không dùng voucher
          </Button>
          <Button onClick={() => apply(picked)} disabled={picked === current}>
            Áp dụng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Địa chỉ nhận hàng ở đầu trang đặt hàng (viền thư như các sàn) */
export function AddressCard({
  receiverName,
  phone,
  fullAddress,
  onChange,
}: {
  receiverName: string;
  phone: string;
  fullAddress: string;
  onChange: () => void;
}) {
  return (
    <section className={cn(CARD, 'overflow-hidden')}>
      <div
        aria-hidden
        className="h-[3px] w-full bg-[repeating-linear-gradient(135deg,var(--color-navy)_0_18px,transparent_18px_26px,var(--color-champagne)_26px_44px,transparent_44px_52px)]"
      />
      <div className="px-4 py-4 lg:px-5">
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Địa chỉ nhận hàng</CardTitle>
          <button
            type="button"
            onClick={onChange}
            className="shrink-0 text-sm font-semibold text-navy transition hover:text-navy-900"
          >
            Thay đổi
          </button>
        </div>
        <div className="mt-3 flex gap-2.5 text-sm">
          <IconMapPin className="mt-0.5 size-5 shrink-0 text-navy [stroke-width:1.75]" />
          <div className="min-w-0 leading-6">
            <span className="font-bold text-charcoal">{receiverName}</span>
            <span className="mx-2 text-ink/25">|</span>
            <span className="font-medium text-charcoal">{phone}</span>
            <div className="text-ink/65">{fullAddress}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
