import { useQuery } from '@tanstack/react-query';
import { Check, MapPin, Plus, TicketPercent } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { voucherDiscountText } from '@/components/catalog/voucher-ticket';
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
          <DialogTitle className="text-navy">Địa chỉ nhận hàng</DialogTitle>
          <DialogDescription>Chọn một địa chỉ trong sổ địa chỉ của bạn.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {list.isPending
            ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
            : list.data?.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPicked(a.id)}
                  className={cn(
                    'flex w-full gap-3 rounded-xl border p-3 text-left transition',
                    picked === a.id
                      ? 'border-navy bg-navy/[0.03] ring-1 ring-navy'
                      : 'border-ivory-200 hover:border-champagne',
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border',
                      picked === a.id ? 'border-navy bg-navy text-white' : 'border-ink/25',
                    )}
                  >
                    {picked === a.id && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold text-ink">{a.receiverName}</span>
                    <span className="text-ink/50"> · {a.phone}</span>
                    {a.isDefault && (
                      <span className="ml-2 rounded border border-champagne px-1.5 text-[11px] text-champagne-600">
                        Mặc định
                      </span>
                    )}
                    <span className="mt-0.5 block text-ink/65">
                      {[a.street, a.wardName, a.districtName, a.provinceName].join(', ')}
                    </span>
                  </span>
                </button>
              ))}
          <Link
            to="/tai-khoan/dia-chi"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink/20 p-3 text-sm font-medium text-navy hover:border-champagne"
          >
            <Plus className="size-4" /> Thêm địa chỉ mới trong Sổ địa chỉ
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
          <DialogTitle className="text-navy">{title}</DialogTitle>
          <DialogDescription>Mỗi lần chỉ áp được một mã.</DialogDescription>
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
        <div className="space-y-2">
          {options.length === 0 && (
            <p className="rounded-xl bg-ivory/60 px-4 py-6 text-center text-sm text-ink/55">
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
                'flex w-full overflow-hidden rounded-xl border text-left transition disabled:cursor-not-allowed',
                picked === v.code
                  ? 'border-navy ring-1 ring-navy'
                  : 'border-ivory-200 enabled:hover:border-champagne',
                !v.eligible && 'opacity-60',
              )}
            >
              <span className="flex w-20 shrink-0 flex-col items-center justify-center bg-navy px-2 py-3 text-champagne">
                <TicketPercent className="size-5" />
                <span className="mt-1 text-center text-[11px] font-semibold leading-tight">
                  {v.code}
                </span>
              </span>
              <span className="min-w-0 flex-1 px-3 py-2.5 text-sm">
                <span className="block font-semibold text-ink">{voucherDiscountText(v)}</span>
                <span className="block text-xs text-ink/55">
                  Đơn tối thiểu {formatMoney(v.minOrder)} · HSD {formatDate(v.endAt)}
                </span>
                {v.eligible ? (
                  <span className="mt-0.5 block text-xs font-medium text-champagne-600">
                    Giảm {formatMoney(v.discount)} cho đơn này
                  </span>
                ) : (
                  <span className="mt-0.5 block text-xs text-red-600">{v.reason}</span>
                )}
              </span>
              <span className="flex items-center pr-3">
                <span
                  className={cn(
                    'flex size-5 items-center justify-center rounded-full border',
                    picked === v.code ? 'border-navy bg-navy text-white' : 'border-ink/25',
                  )}
                >
                  {picked === v.code && <Check className="size-3" />}
                </span>
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

/** Ô địa chỉ nhận hàng ở đầu trang checkout (viền thư kiểu sàn TMĐT) */
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
    <section className="relative overflow-hidden rounded-2xl border border-ivory-200 bg-card">
      <div
        aria-hidden
        className="h-1 w-full bg-[repeating-linear-gradient(135deg,var(--color-navy)_0_14px,transparent_14px_22px,var(--color-champagne)_22px_36px,transparent_36px_44px)]"
      />
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center md:px-5">
        <div className="flex min-w-0 flex-1 gap-3">
          <MapPin className="mt-0.5 size-5 shrink-0 text-champagne-600" />
          <div className="min-w-0 text-sm">
            <div className="font-semibold text-navy">
              {receiverName} <span className="font-normal text-ink/55">· {phone}</span>
            </div>
            <div className="mt-0.5 text-ink/70">{fullAddress}</div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onChange} className="self-start sm:self-auto">
          Thay đổi
        </Button>
      </div>
    </section>
  );
}
