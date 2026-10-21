import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ImageIcon, MessageSquareText, Star, Store } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { PublicReview, PublicReviewPage, ReviewSummary } from '@/lib/engagement-types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ReviewImages } from './review-images';
import { Stars, formatRating } from './stars';

const PAGE_SIZE = 10;

type Filter = { rating?: number; withImages?: boolean };

/** Khóa TanStack Query của đánh giá công khai (để làm mới sau khi viết/sửa đánh giá) */
export const publicReviewsKey = ['public-reviews'] as const;

/**
 * Khối "Đánh giá sản phẩm" (trang sản phẩm) hoặc "Đánh giá shop" (tab của trang shop): sao trung bình lớn,
 * thanh phân bố 5→1 sao, lọc theo sao và "Có hình ảnh", danh sách có ảnh phóng to được và câu trả lời
 * của shop, phân trang. Tên người mua đã được máy chủ che bớt.
 */
export function ReviewsSection({
  source,
  id,
  title,
  className,
}: {
  source: 'product' | 'shop';
  id: string;
  title?: string;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>({});
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: [...publicReviewsKey, source, id, filter, page],
    queryFn: () =>
      api<PublicReviewPage>(
        `${API.market}/${source === 'product' ? 'products' : 'shops'}/${id}/reviews`,
        {
          query: {
            rating: filter.rating,
            withImages: filter.withImages ? 'true' : undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        },
      ),
    placeholderData: keepPreviousData,
  });
  const choose = (f: Filter) => {
    setFilter(f);
    setPage(1);
  };
  const summary = list.data?.summary;

  return (
    <section
      id="danh-gia"
      className={cn(
        'scroll-mt-32 rounded-3xl border border-ivory-200 bg-card p-5 sm:p-8',
        className,
      )}
    >
      <h2 className="flex items-center gap-2.5 text-lg font-bold text-navy sm:text-xl">
        <span className="h-5 w-1 rounded-full bg-champagne" />
        {title ?? (source === 'product' ? 'Đánh giá sản phẩm' : 'Đánh giá của shop')}
      </h2>

      {list.isPending ? (
        <div className="mt-5 space-y-4">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      ) : list.isError ? (
        <LoadError message={list.error.message} onRetry={() => void list.refetch()} />
      ) : summary!.ratingCount === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Chưa có đánh giá"
          text={
            source === 'product'
              ? 'Người mua nhận hàng xong sẽ đánh giá sản phẩm tại đây.'
              : 'Đánh giá các sản phẩm của shop sẽ hiện tại đây.'
          }
        />
      ) : (
        <>
          <SummaryPanel summary={summary!} filter={filter} onFilter={choose} />
          <div
            className={cn(
              'mt-2 divide-y divide-ivory-200 transition-opacity',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            {list.data.items.length === 0 ? (
              <p className="py-10 text-center text-sm text-ink/55">
                Chưa có đánh giá nào hợp bộ lọc này.
              </p>
            ) : (
              list.data.items.map((r) => (
                <ReviewItem key={r.id} review={r} showProduct={source === 'shop'} />
              ))
            )}
          </div>
          <Pager
            className="mt-5"
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            onChange={setPage}
          />
        </>
      )}
    </section>
  );
}

/** Sao trung bình lớn + thanh phân bố (bấm vào một mức sao để lọc) + các nút lọc */
function SummaryPanel({
  summary,
  filter,
  onFilter,
}: {
  summary: ReviewSummary;
  filter: Filter;
  onFilter: (f: Filter) => void;
}) {
  const avg = summary.ratingAvg ?? 0;
  const max = Math.max(1, ...Object.values(summary.stars));
  return (
    <div className="mt-5 grid gap-5 rounded-2xl bg-ivory/70 p-4 ring-1 ring-ivory-200 sm:p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <div className="flex items-center gap-4 md:flex-col md:items-start md:justify-center md:gap-1.5 md:border-r md:border-ivory-200 md:pr-6">
        <div className="text-5xl leading-none font-bold tracking-tight text-navy">
          {formatRating(avg)}
          <span className="ml-1 text-base font-medium text-ink/40">/5</span>
        </div>
        <div>
          <Stars value={avg} starClassName="size-4.5" />
          <div className="mt-1 text-sm text-ink/60">
            {summary.ratingCount.toLocaleString('vi-VN')} đánh giá
          </div>
        </div>
      </div>

      <div className="min-w-0">
        <div className="space-y-1.5">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary.stars[String(n) as keyof typeof summary.stars];
            const active = filter.rating === n;
            return (
              <button
                key={n}
                type="button"
                disabled={count === 0}
                onClick={() => onFilter(active ? {} : { rating: n })}
                className={cn(
                  'grid w-full grid-cols-[2.75rem_minmax(0,1fr)_2.5rem] items-center gap-3 rounded-lg px-1.5 py-0.5 text-sm transition disabled:cursor-default',
                  active ? 'bg-card ring-1 ring-champagne' : 'enabled:hover:bg-card',
                )}
                aria-pressed={active}
                aria-label={`${n} sao: ${count} đánh giá`}
              >
                <span className="flex items-center gap-1 font-medium text-ink/70">
                  {n}
                  <Star className="size-3.5 fill-champagne text-champagne" />
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-ivory-200">
                  <span
                    className="block h-full rounded-full bg-champagne transition-[width]"
                    style={{ width: `${(count / max) * 100}%` }}
                  />
                </span>
                <span className="text-right text-xs text-ink/55">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Lọc đánh giá">
          <FilterChip active={!filter.rating && !filter.withImages} onClick={() => onFilter({})}>
            Tất cả
          </FilterChip>
          {[5, 4, 3, 2, 1].map((n) => (
            <FilterChip
              key={n}
              active={filter.rating === n}
              onClick={() => onFilter({ rating: n, withImages: filter.withImages })}
            >
              {n} sao ({summary.stars[String(n) as keyof typeof summary.stars]})
            </FilterChip>
          ))}
          <FilterChip
            active={!!filter.withImages}
            onClick={() => onFilter({ rating: filter.rating, withImages: !filter.withImages })}
          >
            <ImageIcon className="size-3.5" />
            Có hình ảnh ({summary.withImages})
          </FilterChip>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
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
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-champagne',
        active
          ? 'border-navy bg-navy text-white'
          : 'border-ivory-200 bg-card text-ink/75 hover:border-champagne hover:text-navy',
      )}
    >
      {children}
    </button>
  );
}

/** Một đánh giá: người mua (đã che tên), sao, ngày, phân loại, nội dung, ảnh, câu trả lời của shop */
export function ReviewItem({
  review: r,
  showProduct,
}: {
  review: PublicReview;
  showProduct?: boolean;
}) {
  return (
    <article className="flex gap-3 py-5 sm:gap-4">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-champagne"
      >
        {r.buyerName.slice(0, 1).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-ink">{r.buyerName}</span>
          <Stars value={r.rating} />
        </div>
        <div className="mt-0.5 text-xs text-ink/50">
          {formatDate(r.createdAt)}
          {r.variantName && <> · Phân loại: {r.variantName}</>}
          {r.edited && <> · Đã sửa</>}
        </div>
        {showProduct && r.product && (
          <Link
            to={`/san-pham/${r.product.id}`}
            className="mt-1.5 inline-block max-w-full truncate text-xs font-medium text-champagne-600 hover:text-navy hover:underline"
          >
            {r.product.name}
          </Link>
        )}
        {r.content && (
          <p className="mt-2 text-sm leading-6 break-words whitespace-pre-line text-ink/85">
            {r.content}
          </p>
        )}
        <ReviewImages images={r.images} className="mt-3" />
        {r.sellerReply && (
          <div className="mt-3 rounded-xl border-l-[3px] border-champagne bg-ivory px-4 py-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-navy">
              <Store className="size-3.5 text-champagne-600" />
              Phản hồi của shop
              {r.sellerRepliedAt && (
                <span className="font-normal text-ink/45">· {formatDate(r.sellerRepliedAt)}</span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6 break-words whitespace-pre-line text-ink/80">
              {r.sellerReply}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
