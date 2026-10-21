import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareReply, MessageSquareText, Pencil, Star, Store } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { PageHeader } from '@/components/layout/page-header';
import { ReviewImages } from '@/components/reviews/review-images';
import { publicReviewsKey } from '@/components/reviews/review-list';
import { Stars, formatRating } from '@/components/reviews/stars';
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
import { API, api } from '@/lib/api';
import type { SellerReview, SellerReviewPage } from '@/lib/engagement-types';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const sellerReviewsKey = ['seller', 'reviews'] as const;
const PAGE_SIZE = 10;

const REPLIED_TABS = [
  { value: '', label: 'Tất cả' },
  { value: 'false', label: 'Chưa trả lời' },
  { value: 'true', label: 'Đã trả lời' },
] as const;

/**
 * Kênh người bán › Đánh giá (ENG-02): đánh giá của mọi sản phẩm trong shop, lọc theo sao và đã/chưa trả
 * lời. Shop trả lời mỗi đánh giá một lần và sửa được câu trả lời; không sửa được nội dung của người mua.
 */
export function SellerReviewsPage() {
  const [params, setParams] = useSearchParams();
  const rating = Number(params.get('sao')) || undefined;
  const replied = params.get('tra-loi') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [replying, setReplying] = useState<SellerReview | null>(null);

  const list = useQuery({
    queryKey: [...sellerReviewsKey, rating, replied, page],
    queryFn: () =>
      api<SellerReviewPage>(`${API.market}/shops/me/reviews`, {
        query: { rating, replied: replied || undefined, page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const set = (next: Record<string, string | undefined>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!('page' in next)) p.delete('page');
    setParams(p, { replace: true });
  };
  const summary = list.data?.summary;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Shop' }, { label: 'Đánh giá' }]}
        title="Đánh giá của shop"
        description="Người mua đánh giá sau khi đơn hoàn tất. Trả lời lịch sự, rõ ràng để người mua khác yên tâm; câu trả lời hiện công khai dưới đánh giá."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Sao trung bình của shop">
          {summary ? (
            summary.ratingAvg !== null ? (
              <span className="flex items-center gap-2">
                {formatRating(summary.ratingAvg)}
                <Stars value={summary.ratingAvg} starClassName="size-4" />
              </span>
            ) : (
              <span className="text-base font-medium text-ink/50">Chưa có</span>
            )
          ) : (
            <Skeleton className="h-7 w-24" />
          )}
        </SummaryTile>
        <SummaryTile label="Số đánh giá">
          {summary ? (
            summary.ratingCount.toLocaleString('vi-VN')
          ) : (
            <Skeleton className="h-7 w-16" />
          )}
        </SummaryTile>
        <SummaryTile label="Chưa trả lời" accent={!!summary?.unreplied}>
          {summary ? summary.unreplied.toLocaleString('vi-VN') : <Skeleton className="h-7 w-16" />}
        </SummaryTile>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <nav className="flex gap-1 overflow-x-auto border-b px-4 pt-2 md:px-5" aria-label="Trả lời">
          {REPLIED_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => set({ 'tra-loi': t.value })}
              className={cn(
                '-mb-px shrink-0 border-b-2 px-3 py-3 text-sm whitespace-nowrap transition',
                replied === t.value
                  ? 'border-navy font-semibold text-navy'
                  : 'border-transparent text-muted-foreground hover:text-ink',
              )}
            >
              {t.label}
              {t.value === 'false' && !!summary?.unreplied && (
                <span className="ml-1 rounded-full bg-champagne-50 px-1.5 text-xs text-champagne-600">
                  {summary.unreplied}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div
          className="flex gap-2 overflow-x-auto border-b px-4 py-3 md:px-5"
          role="group"
          aria-label="Lọc theo sao"
        >
          <StarChip active={!rating} onClick={() => set({ sao: undefined })}>
            Mọi mức sao
          </StarChip>
          {[5, 4, 3, 2, 1].map((n) => (
            <StarChip key={n} active={rating === n} onClick={() => set({ sao: String(n) })}>
              {n}
              <Star className="size-3.5 fill-champagne text-champagne" />
              {summary && (
                <span className="text-xs opacity-70">
                  ({summary.stars[String(n) as keyof typeof summary.stars]})
                </span>
              )}
            </StarChip>
          ))}
        </div>

        {list.isPending ? (
          <div className="space-y-3 p-5">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : list.isError ? (
          <LoadError message={list.error.message} onRetry={() => list.refetch()} />
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title={summary?.ratingCount ? 'Không có đánh giá hợp bộ lọc' : 'Shop chưa có đánh giá'}
            text="Khi đơn hoàn tất, người mua có thể đánh giá sản phẩm; bạn sẽ nhận thông báo và trả lời tại đây."
          />
        ) : (
          <>
            <ul
              className={cn('divide-y transition-opacity', list.isPlaceholderData && 'opacity-60')}
            >
              {list.data.items.map((r) => (
                <li key={r.id}>
                  <ReviewRow review={r} onReply={() => setReplying(r)} />
                </li>
              ))}
            </ul>
            <Pager
              className="border-t px-5 py-3"
              page={page}
              pageSize={PAGE_SIZE}
              total={list.data.total}
              onChange={(p) => set({ page: String(p) })}
            />
          </>
        )}
      </div>

      <ReplyDialog review={replying} onClose={() => setReplying(null)} />
    </div>
  );
}

function SummaryTile({
  label,
  accent,
  children,
}: {
  label: string;
  accent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border bg-card px-5 py-4 shadow-sm shadow-navy/[0.03]',
        accent && 'border-champagne/60 bg-champagne-50/50',
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-navy">{children}</div>
    </div>
  );
}

function StarChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-[13px] font-medium transition',
        active
          ? 'border-navy bg-navy text-white'
          : 'border-ivory-200 bg-ivory/60 text-ink/75 hover:border-champagne hover:text-navy',
      )}
    >
      {children}
    </button>
  );
}

function ReviewRow({ review: r, onReply }: { review: SellerReview; onReply: () => void }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:gap-5 md:px-5">
      <Link
        to={`/san-pham/${r.product.id}`}
        className="flex min-w-0 items-center gap-3 md:w-60 md:shrink-0 md:items-start"
      >
        <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-ivory-200 bg-card p-1">
          {r.product.image ? (
            <img src={r.product.image} alt="" className="size-full object-contain" />
          ) : (
            <Store className="size-5 text-champagne-600" />
          )}
        </span>
        <span className="min-w-0 text-sm">
          <span className="line-clamp-2 font-medium text-ink hover:text-navy">
            {r.product.name}
          </span>
          {r.variantName && <span className="block text-xs text-ink/55">{r.variantName}</span>}
        </span>
      </Link>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Stars value={r.rating} starClassName="size-4" />
          <span className="font-medium text-ink">{r.buyerName}</span>
          <span className="text-xs text-ink/50">
            {formatDateTime(r.createdAt)}
            {r.edited && ' · Đã sửa'} ·{' '}
            <Link
              to={`/kenh-nguoi-ban/don-hang/${r.shopOrderId}`}
              className="hover:text-navy hover:underline"
            >
              Đơn {r.shopOrderCode}
            </Link>
          </span>
        </div>
        {r.content ? (
          <p className="mt-2 leading-6 break-words whitespace-pre-line text-ink/85">{r.content}</p>
        ) : (
          <p className="mt-2 text-xs text-ink/45 italic">
            Người mua chỉ chấm sao, không viết nhận xét.
          </p>
        )}
        <ReviewImages images={r.images} className="mt-2.5" />
        {r.sellerReply ? (
          <div className="mt-3 rounded-xl border-l-[3px] border-champagne bg-ivory px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-navy">
                Câu trả lời của shop
                {r.sellerRepliedAt && (
                  <span className="font-normal text-ink/45">
                    {' '}
                    · {formatDateTime(r.sellerRepliedAt)}
                  </span>
                )}
              </span>
              <Button variant="ghost" size="xs" onClick={onReply} className="text-champagne-600">
                <Pencil /> Sửa
              </Button>
            </div>
            <p className="mt-1 leading-6 break-words whitespace-pre-line text-ink/80">
              {r.sellerReply}
            </p>
          </div>
        ) : (
          <div className="mt-3 flex justify-end">
            <Button size="sm" onClick={onReply} className="w-full rounded-lg sm:w-auto">
              <MessageSquareReply className="size-4" /> Trả lời
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyDialog({ review, onClose }: { review: SellerReview | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  useEffect(() => {
    if (review) setContent(review.sellerReply ?? '');
  }, [review]);
  const save = useMutation({
    mutationFn: () =>
      api<SellerReview>(`${API.market}/shops/me/reviews/${review!.id}/reply`, {
        method: 'PUT',
        body: { content: content.trim() },
      }),
    onSuccess: () => {
      toast.success(review?.sellerReply ? 'Đã sửa câu trả lời.' : 'Đã gửi câu trả lời.');
      void qc.invalidateQueries({ queryKey: sellerReviewsKey });
      void qc.invalidateQueries({ queryKey: publicReviewsKey });
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const text = content.trim();
  return (
    <Dialog open={!!review} onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-navy">
            {review?.sellerReply ? 'Sửa câu trả lời' : 'Trả lời đánh giá'}
          </DialogTitle>
          <DialogDescription>
            Câu trả lời hiện công khai dưới đánh giá ở trang sản phẩm và trang shop.
          </DialogDescription>
        </DialogHeader>
        {review && (
          <div className="rounded-xl bg-ivory px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={review.rating} />
              <span className="font-medium text-ink">{review.buyerName}</span>
            </div>
            {review.content && (
              <p className="mt-1.5 line-clamp-4 break-words whitespace-pre-line text-ink/75">
                {review.content}
              </p>
            )}
          </div>
        )}
        <div>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Cảm ơn bạn đã tin tưởng shop..."
            disabled={save.isPending}
          />
          <div className="mt-1 text-right text-xs text-ink/45">{content.length}/1000</div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>
            Hủy
          </Button>
          <Button onClick={() => save.mutate()} disabled={!text || save.isPending}>
            {save.isPending && <Loader2 className="size-4 animate-spin" />}
            {review?.sellerReply ? 'Lưu câu trả lời' : 'Gửi trả lời'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
