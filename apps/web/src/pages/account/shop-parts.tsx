import { Store } from 'lucide-react';
import { maskAccount } from '@/lib/format';
import type { ApplicationView, ShopView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { InfoRow } from './account-parts';

/** Logo shop: ảnh vuông bo góc, chưa có thì hiện icon cửa hàng */
export function ShopLogo({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    <img
      src={url}
      alt="Logo shop"
      className={cn('size-16 shrink-0 rounded-2xl border bg-white object-cover', className)}
    />
  ) : (
    <span
      className={cn(
        'flex size-16 shrink-0 items-center justify-center rounded-2xl border border-dashed border-champagne/60 bg-champagne-50 text-champagne-600',
        className,
      )}
    >
      <Store className="size-1/2" />
    </span>
  );
}

/** Tóm tắt thông tin shop đã nộp / đang dùng. Số tài khoản chỉ hiện 4 số cuối. */
export function ShopSummary({ shop }: { shop: ShopView }) {
  return (
    <div className="flex flex-col gap-5 sm:flex-row">
      <ShopLogo url={shop.logoUrl} className="size-20" />
      <dl className="min-w-0 flex-1 divide-y">
        <InfoRow label="Tên shop">
          <span className="font-medium text-navy">{shop.name ?? '—'}</span>
        </InfoRow>
        <InfoRow label="Mô tả">
          <span className="whitespace-pre-line">{shop.description ?? '—'}</span>
        </InfoRow>
        <InfoRow label="Số điện thoại shop">{shop.phone ?? '—'}</InfoRow>
        <InfoRow label="Địa chỉ lấy hàng">{shop.pickupAddress?.fullText ?? '—'}</InfoRow>
        <InfoRow label="Tài khoản nhận tiền">
          {shop.bankAccount ? (
            <>
              {shop.bankAccount.bankName} · {maskAccount(shop.bankAccount.accountNumber)} ·{' '}
              {shop.bankAccount.accountName}
            </>
          ) : (
            '—'
          )}
        </InfoRow>
      </dl>
    </div>
  );
}

/** Nội dung yêu cầu đổi thông tin: "tên shop → An Phát Mobile; tài khoản → Vietcombank ****5667" */
export function describeChange(change: ApplicationView['change']): string {
  if (!change) return 'thông tin shop';
  const parts: string[] = [];
  if (change.fields.includes('name')) parts.push(`tên shop thành "${change.name ?? ''}"`);
  if (change.fields.includes('bankAccount') && change.bankAccount) {
    parts.push(
      `tài khoản nhận tiền thành ${change.bankAccount.bankName} ${maskAccount(change.bankAccount.accountNumber)}`,
    );
  }
  return parts.join(' và ') || 'thông tin shop';
}

/** Tên chủ tài khoản như trên thẻ: viết hoa, bỏ dấu ("Nguyễn Văn An" → "NGUYEN VAN AN") */
export function toCardName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toUpperCase();
}
