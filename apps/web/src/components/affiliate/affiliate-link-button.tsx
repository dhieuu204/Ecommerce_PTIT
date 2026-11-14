import { IconCheck, IconLink } from '@tabler/icons-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useMyAffiliate } from '@/hooks/use-my-affiliate';
import { useMyShop } from '@/hooks/use-my-shop';
import { affiliateLink } from '@/lib/affiliate-link';
import { ratePercent } from '@/lib/affiliate-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Sao chép vào bộ nhớ tạm; trình duyệt chặn thì báo để người dùng tự chép */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    toast.error('Trình duyệt chưa cho sao chép, bạn chép link thủ công nhé.');
    return false;
  }
}

/**
 * Nút "Lấy link" (P7, AFF-03): chỉ hiện cho cộng tác viên đang hoạt động, không hiện với hàng của shop mình.
 * Link sản phẩm cần sản phẩm có bật hoa hồng; link shop thì không.
 */
export function AffiliateLinkButton({
  target,
  shopId,
  rate,
  price,
  className,
}: {
  target: { productId: string } | { shopId: string };
  shopId: string;
  /** Hoa hồng của sản phẩm (link sản phẩm); undefined với link shop */
  rate?: number | null;
  /** Giá thấp nhất, để ước tính hoa hồng mỗi sản phẩm */
  price?: number;
  className?: string;
}) {
  const me = useMyAffiliate();
  const shop = useMyShop();
  const [copied, setCopied] = useState(false);
  const code = me.data?.status === 'ACTIVE' ? me.data.affiliate?.code : null;
  const isProduct = 'productId' in target;
  if (!code || shop.data?.shop?.id === shopId || (isProduct && !rate)) return null;

  const copy = async () => {
    if (await copyText(affiliateLink(code, target))) {
      setCopied(true);
      toast.success('Đã sao chép link tiếp thị.');
      window.setTimeout(() => setCopied(false), 2000);
    }
  };
  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-dashed border-navy/40 bg-champagne-50/60 px-3.5 py-2.5 text-left transition hover:border-navy hover:bg-champagne-50',
        className,
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-card text-navy">
        {copied ? (
          <IconCheck className="size-[1.125rem] [stroke-width:2]" />
        ) : (
          <IconLink className="size-[1.125rem] [stroke-width:1.75]" />
        )}
      </span>
      <span className="min-w-0 flex-1 text-sm">
        <span className="block font-semibold text-navy">
          {isProduct ? 'Lấy link tiếp thị' : 'Lấy link shop'}
          {rate ? ` · Hoa hồng ${ratePercent(rate)}` : ''}
        </span>
        <span className="block text-xs text-ink/60">
          {isProduct && rate && price
            ? `Khoảng ${formatMoney(Math.floor((price * rate) / 10_000))} mỗi sản phẩm bán được qua link`
            : 'Mọi sản phẩm có hoa hồng của shop đều được tính cho bạn'}
        </span>
      </span>
    </button>
  );
}
