import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CalendarClock, MessageSquareText, PackageCheck, Pencil, Star, Store } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import {
  ReviewFormDialog,
  daysLeft,
  deadlineText,
  myReviewsKey,
  type ReviewTarget,
} from '@/components/reviews/review-form-dialog';
import { ReviewImages } from '@/components/reviews/review-images';
import { Stars } from '@/components/reviews/stars';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { MyReview, PendingReviewItem } from '@/lib/engagement-types';
import { formatDate, formatDateTime } from '@/lib/format';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 10;
type Tab = 'PENDING' | 'DONE';

/**
 * Tài khoản › Đánh giá của tôi (ENG-01): "Chờ đánh giá" (món của đơn đã hoàn tất, còn hạn) và "Đã đánh giá"
 * (sửa được một lần trong hạn, xem câu trả lời của shop).
 */
export function MyReviewsPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'da-danh-gia' ? 'DONE' : 'PENDING';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [target, setTarget] = useState<ReviewTarget | null>(null);

  const list = useQuery({
    queryKey: [...myReviewsKey, tab, page],
    queryFn: () =>
      api<Page<PendingReviewItem | MyReview>>(`${API.market}/me/reviews`, {
        query: { state: tab, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  // Số trên tab còn lại (tải nhẹ: 1 dòng)
  const otherTab: Tab = tab === 'PENDING' ? 'DONE' : 'PENDING';
  const other = useQuery({
    queryKey: [...myReviewsKey, otherTab, 'count'],
    queryFn: () =>
      api<Page<unknown>>(`${API.market}/me/reviews`, { query: { state: otherTab, pageSize: 1 } }),
  });
  const count = (t: Tab) =>
    t === tab ? list.data?.total : t === otherTab ? other.data?.total : undefined;

  const go = (next: Tab, p = 1) => {
    const q: Record<string, string> = {};
    if (next === 'DONE') q.tab = 'da-danh-gia';
    if (p > 1) q.page = String(p);
    setParams(q, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 pt-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Đánh giá của tôi</h1>
        <p className="mt-1 text-sm text-ink/60">
          Đánh giá các món của đơn đã hoàn tất, trong hạn kể từ lúc đơn hoàn tất. Mỗi đánh giá sửa
          được một lần.
        </p>
        <nav className="mt-3 flex gap-1" role="tablist">
          {(
            [
              ['PENDING', 'Chờ đánh giá'],
              ['DONE', 'Đã đánh giá'],
            ] as const
          ).map(([t, label]) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => go(t)}
              className={cn(
                '-mb-px border-b-2 px-3 py-2.5 text-sm transition',
                tab === t
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-ink/60 hover:text-ink',
              )}
            >
              {label}
              {!!count(t) && (
                <span className="ml-1.5 rounded-full bg-champagne-50 px-1.5 text-xs text-champagne-600">
                  {count(t)}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : list.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={list.error.message}
          onRetry={() => list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={tab === 'PENDING' ? PackageCheck : MessageSquareText}
          title={tab === 'PENDING' ? 'Không có món nào chờ đánh giá' : 'Bạn chưa viết đánh giá nào'}
          text={
            tab === 'PENDING'
              ? 'Khi đơn hoàn tất, các món trong đơn sẽ hiện ở đây để bạn đánh giá.'
              : 'Đánh giá của bạn giúp người mua khác chọn hàng tốt hơn.'
          }
          action={
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link to="/tai-khoan/don-mua">Xem đơn mua</Link>
            </Button>
          }
        />
      ) : (
        <div className={cn('space-y-3 transition-opacity', list.isPlaceholderData && 'opacity-60')}>
          {tab === 'PENDING'
            ? (list.data.items as PendingReviewItem[]).map((it) => (
                <PendingRow
                  key={it.orderItemId}
                  item={it}
                  onReview={() => setTarget({ mode: 'create', item: it })}
                />
              ))
            : (list.data.items as MyReview[]).map((r) => (
                <DoneRow
                  key={r.id}
                  review={r}
                  onEdit={() => setTarget({ mode: 'edit', review: r })}
                />
              ))}
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => go(tab, p)}
          />
        </div>
      )}

      <ReviewFormDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

function ProductThumb({ image }: { image: string | null }) {
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1">
      {image ? (
        <img src={image} alt="" className="size-full object-contain" />
      ) : (
        <Star className="size-5 text-champagne-600" />
      )}
    </span>
  );
}

function ShopLine({
  shop,
  orderId,
  code,
}: {
  shop: { id: string; name: string };
  orderId: string;
  code: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink/55">
      <Link to={`/shop/${shop.id}`} className="inline-flex items-center gap-1 hover:text-navy">
        <Store className="size-3.5 text-champagne-600" />
        {shop.name}
      </Link>
      <span>·</span>
      <Link to={`/tai-khoan/don-mua/${orderId}`} className="hover:text-navy hover:underline">
        Đơn {code}
      </Link>
    </div>
  );
}

function PendingRow({ item, onReview }: { item: PendingReviewItem; onReview: () => void }) {
  const left = daysLeft(item.reviewBefore);
  return (
    <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-3.5 md:px-5">
      <ShopLine shop={item.shop} orderId={item.orderId} code={item.shopOrderCode} />
      <div className="mt-2.5 flex flex-wrap items-center gap-3">
        <ProductThumb image={item.image} />
        <div className="min-w-0 flex-1 text-sm">
          <Link
            to={`/san-pham/${item.productId}`}
            className="line-clamp-2 font-medium text-ink hover:text-navy"
          >
            {item.productName}
          </Link>
          <div className="text-xs text-ink/55">
            {item.variantName && <>Phân loại: {item.variantName} · </>}×{item.quantity}
          </div>
          <div
            className={cn(
              'mt-1 inline-flex items-center gap-1 text-xs',
              left <= 3 ? 'font-medium text-amber-700' : 'text-ink/55',
            )}
          >
            <CalendarClock className="size-3.5" />
            Hoàn tất {formatDate(item.completedAt)} · {deadlineText(item.reviewBefore)}
          </div>
        </div>
        <Button onClick={onReview} className="w-full rounded-lg sm:w-auto">
          <Star className="size-4" /> Đánh giá
        </Button>
      </div>
    </div>
  );
}

function DoneRow({ review: r, onEdit }: { review: MyReview; onEdit: () => void }) {
  return (
    <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-3.5 md:px-5">
      <ShopLine shop={r.shop} orderId={r.orderId} code={r.shopOrderCode} />
      <div className="mt-2.5 flex gap-3">
        <ProductThumb image={r.image} />
        <div className="min-w-0 flex-1 text-sm">
          <Link
            to={`/san-pham/${r.productId}`}
            className="line-clamp-2 font-medium text-ink hover:text-navy"
          >
            {r.productName}
          </Link>
          {r.variantName && <div className="text-xs text-ink/55">Phân loại: {r.variantName}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Stars value={r.rating} starClassName="size-4" />
            <span className="text-xs text-ink/50">
              {formatDateTime(r.createdAt)}
              {r.edited && ' · Đã sửa'}
            </span>
          </div>
          {r.content && (
            <p className="mt-2 leading-6 break-words whitespace-pre-line text-ink/85">
              {r.content}
            </p>
          )}
          <ReviewImages images={r.images} className="mt-2.5" />
          {r.sellerReply && (
            <div className="mt-3 rounded-xl border-l-[3px] border-champagne bg-ivory px-4 py-3">
              <div className="text-xs font-semibold text-navy">Phản hồi của shop</div>
              <p className="mt-1 leading-6 break-words whitespace-pre-line text-ink/80">
                {r.sellerReply}
              </p>
            </div>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3 border-t border-dashed border-ivory-200 pt-3">
        {r.canEdit ? (
          <>
            <span className="text-xs text-ink/55">
              Sửa được một lần · {deadlineText(r.editBefore)}
            </span>
            <Button variant="outline" size="sm" onClick={onEdit} className="rounded-lg">
              <Pencil className="size-3.5" /> Sửa đánh giá
            </Button>
          </>
        ) : (
          <span className="text-xs text-ink/50">
            {r.edited ? 'Bạn đã dùng lượt sửa của đánh giá này.' : 'Đã hết hạn sửa đánh giá.'}
          </span>
        )}
      </div>
    </div>
  );
}
