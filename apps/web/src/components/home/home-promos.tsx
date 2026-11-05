import { IconBuildingStore, IconCheck } from '@tabler/icons-react';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { useProductSearch } from '@/components/catalog/browse-query';
import { dayMonth, shortValue } from '@/components/catalog/voucher-ticket';
import { Skeleton } from '@/components/ui/skeleton';
import { HOME_BEST_SELLING } from './home-sections';
import { API, api } from '@/lib/api';
import type { Voucher } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hạn dùng: còn ít ngày thì đếm ngược cho gấp, còn lâu thì ghi ngày */
function expiryText(endAt: string): { text: string; soon: boolean } {
  const days = Math.ceil((new Date(endAt).getTime() - Date.now()) / DAY_MS);
  if (days <= 1) return { text: 'Hết hạn hôm nay', soon: true };
  if (days <= 3) return { text: `Còn ${days} ngày`, soon: true };
  return { text: `HSD ${dayMonth(endAt)}`, soon: false };
}

/**
 * Khung vé chung cho mọi mã (một kiểu đồng bộ, theo vé của Shopee): cuống màu bên trái có mép trái răng
 * cưa, thân trắng bên phải; tùy chọn nhãn gập góc chìa ra mép trái.
 */
function Ticket({
  stub,
  stubClass,
  ribbon,
  className,
  children,
}: {
  stub: React.ReactNode;
  stubClass: string;
  ribbon?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'relative flex h-24 rounded-xl border border-ink/10 bg-card transition hover:shadow-[0_10px_24px_-16px_rgba(15,23,42,0.35)]',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex w-[5.25rem] shrink-0 flex-col items-center justify-center rounded-l-xl text-white',
          ribbon && 'pt-3',
          stubClass,
        )}
      >
        {stub}
        {/* Mép trái răng cưa */}
        <span
          aria-hidden
          className="absolute inset-y-2.5 -left-[3px] flex flex-col justify-between"
        >
          {Array.from({ length: 9 }, (_, i) => (
            <span key={i} className="size-1.5 rounded-full bg-card" />
          ))}
        </span>
      </div>
      {ribbon && (
        <span className="absolute top-1.5 -left-1 z-10 rounded-r-sm bg-navy px-1.5 py-px text-[10px] font-bold text-white shadow-sm">
          {ribbon}
          {/* Nếp gập dưới nhãn */}
          <span
            aria-hidden
            className="absolute top-full left-0 border-t-4 border-l-4 border-t-navy-950 border-l-transparent"
          />
        </span>
      )}
      {children}
    </div>
  );
}

/**
 * Vé voucher shop: cuống cam ghi mức giảm, thân ghi điều kiện, shop và hạn dùng, nút "Lưu" trong vé.
 * "Lưu" = sao chép mã: bước thanh toán tự chọn voucher tốt nhất của từng shop và cho đổi voucher, nên không
 * cần kho voucher đã lưu riêng.
 */
function VoucherCard({ v, shop }: { v: Voucher; shop: { id: string; name: string } }) {
  const [saved, setSaved] = useState(false);
  const expiry = expiryText(v.endAt);
  const save = async () => {
    try {
      await navigator.clipboard.writeText(v.code);
      setSaved(true);
      toast.success(`Đã lưu mã ${v.code}`, {
        description: `Dùng khi thanh toán đơn của ${shop.name}.`,
      });
    } catch {
      toast.error(`Không lưu được. Mã voucher là ${v.code}.`);
    }
  };

  return (
    <Ticket
      stubClass="bg-gradient-to-br from-header-from to-header-to"
      stub={
        <>
          <span className="text-[10px] font-semibold tracking-[0.16em] uppercase opacity-90">
            Giảm
          </span>
          <span className="mt-0.5 text-[1.375rem] leading-none font-bold tracking-tight">
            {shortValue(v)}
          </span>
        </>
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 pl-4">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-charcoal" title={v.name}>
            {v.discountType === 'PERCENT'
              ? `Giảm ${v.value}%${v.maxDiscount ? `, tối đa ${shortValue({ discountType: 'AMOUNT', value: v.maxDiscount })}` : ''}`
              : `Giảm ${formatMoney(v.value)}`}
          </div>
          <div className="mt-0.5 truncate text-xs text-ink/60">
            {v.minOrder > 0 ? `Đơn tối thiểu ${formatMoney(v.minOrder)}` : 'Cho mọi đơn hàng'}
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ink/45">
            <Link
              to={`/shop/${shop.id}`}
              className="flex min-w-0 items-center gap-1 hover:text-navy focus-visible:text-navy focus-visible:outline-none"
            >
              <IconBuildingStore className="size-3.5 shrink-0" />
              <span className="truncate">{shop.name}</span>
            </Link>
            <span className="text-ink/25">|</span>
            <span className={cn('shrink-0', expiry.soon && 'font-medium text-navy')}>
              {expiry.text}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          aria-label={saved ? `Đã lưu mã ${v.code}` : `Lưu mã ${v.code}`}
          className={cn(
            'inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-3.5 text-xs font-semibold transition focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-[0.96]',
            saved ? 'border border-navy/30 text-navy' : 'bg-navy text-white hover:bg-navy-900',
          )}
        >
          {saved && <IconCheck className="size-3.5 [stroke-width:2.25]" />}
          {saved ? 'Đã lưu' : 'Lưu'}
        </button>
      </div>
    </Ticket>
  );
}

/**
 * Vé mã vận chuyển (Free Ship) kiểu Shopee, cuống xanh ngọc. Sàn CHƯA có voucher miễn phí vận chuyển (bước
 * thanh toán chưa áp được), nên vé ghi "Sắp ra mắt" và không có nút lưu; có tính năng thật thì thay bằng
 * dữ liệu voucher vận chuyển.
 */
function FreeShipCard({ className }: { className?: string }) {
  return (
    <Ticket
      className={className}
      ribbon="Mọi shop"
      stubClass="bg-ship"
      stub={
        <>
          <span className="text-center text-[17px] leading-[1.05] font-extrabold tracking-tight uppercase italic">
            Free
            <br />
            Ship
          </span>
          <span className="mt-1 text-[10px] font-medium opacity-90">Mã vận chuyển</span>
        </>
      }
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-2.5 pr-3 pl-4">
        <div className="truncate text-[15px] leading-tight font-bold text-charcoal">
          Miễn phí vận chuyển
        </div>
        <div className="truncate text-xs text-ink/60">Cho đơn của mọi shop trên sàn</div>
        <span className="mt-1 w-fit rounded border border-navy px-1.5 py-px text-[11px] leading-4 text-navy">
          Sắp ra mắt
        </span>
      </div>
    </Ticket>
  );
}

/**
 * Khối "Mã giảm giá" dưới đầu trang: tối đa 4 voucher đang chạy sắp hết hạn nhất của các shop bán chạy.
 * Chưa có API voucher sàn công khai nên lấy voucher shop qua GET /shops/{id}/vouchers. Ít hơn 3 voucher thì
 * thêm vé mã vận chuyển để hàng vé luôn cân (mỗi vé rộng khoảng 1/3 hàng, không bị kéo dài trống trải).
 */
function VoucherStrip() {
  const products = useProductSearch(HOME_BEST_SELLING);
  const shops = [
    ...new Map((products.data?.items ?? []).map((p) => [p.shop.id, p.shop])).values(),
  ].slice(0, 4);
  const lists = useQueries({
    queries: shops.map((s) => ({
      queryKey: ['shop-vouchers', s.id],
      queryFn: () => api<Voucher[]>(`${API.market}/shops/${s.id}/vouchers`),
      staleTime: 60_000,
    })),
  });
  const loading = products.isPending || lists.some((l) => l.isPending);
  const vouchers = lists
    .flatMap((l, i) => (l.data ?? []).map((v) => ({ v, shop: shops[i]! })))
    .sort((a, b) => a.v.endAt.localeCompare(b.v.endAt))
    .slice(0, 4);
  if (!loading && vouchers.length === 0) return null;

  const four = !loading && vouchers.length === 4;
  return (
    <div className="rounded-2xl bg-card p-4 md:p-5">
      <h2 className="mb-3.5 flex items-center gap-2.5 text-base font-bold tracking-tight text-charcoal">
        <span aria-hidden className="h-[3px] w-5 shrink-0 rounded-full bg-navy" />
        Mã giảm giá
      </h2>
      <div className={cn('grid gap-3 sm:grid-cols-2', four ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        {loading
          ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
          : vouchers.map(({ v, shop }) => <VoucherCard key={v.id} v={v} shop={shop} />)}
        {!loading && vouchers.length < 3 && (
          <FreeShipCard
            className={cn('hidden lg:flex', vouchers.length === 1 && 'lg:col-span-2')}
          />
        )}
      </div>
    </div>
  );
}

/** Hàng dưới đầu trang: khối mã giảm giá (2 banner nhỏ đã lên cột phải của đầu trang) */
export function HomePromos() {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-4">
      <VoucherStrip />
    </section>
  );
}
