import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Package, PauseCircle, Store } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { ShopLogo } from '@/components/console/shop-logo';
import { followedShopsKey } from '@/components/reviews/engagement';
import { RatingInline } from '@/components/reviews/stars';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api } from '@/lib/api';
import type { FollowedShop } from '@/lib/engagement-types';
import { formatDate } from '@/lib/format';
import type { Page } from '@/lib/types';

const PAGE_SIZE = 12;

/** Tài khoản › Shop đang theo dõi (ENG-03): mới theo dõi trước, bỏ theo dõi ngay tại đây */
export function FollowedShopsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: [...followedShopsKey, page],
    queryFn: () =>
      api<Page<FollowedShop>>(`${API.market}/me/followed-shops`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const unfollow = useMutation({
    mutationFn: (shopId: string) =>
      api(`${API.market}/shops/${shopId}/follow`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã bỏ theo dõi shop.');
      void qc.invalidateQueries({ queryKey: followedShopsKey });
      void qc.invalidateQueries({ queryKey: ['shop-follow'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Shop đang theo dõi</h1>
        <p className="mt-1 text-sm text-ink/60">
          Theo dõi shop ở trang shop để quay lại nhanh khi cần mua tiếp.
        </p>
      </div>

      {list.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : list.isError ? (
        <LoadError
          className="rounded-2xl border bg-card"
          message={list.error.message}
          onRetry={() => list.refetch()}
        />
      ) : list.data.items.length === 0 ? (
        <EmptyState
          className="rounded-2xl border bg-card"
          icon={Store}
          title="Bạn chưa theo dõi shop nào"
          text="Bấm “Theo dõi” ở trang shop yêu thích để thấy shop ở đây."
          action={
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link to="/tim-kiem">Khám phá sản phẩm</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {list.data.items.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-ivory-200 bg-card p-4 transition hover:border-champagne/60"
              >
                <Link to={`/shop/${s.id}`} className="flex min-w-0 items-center gap-3">
                  <ShopLogo url={s.logoUrl} className="size-14 rounded-xl border" />
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-navy hover:underline">{s.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink/60">
                      {s.ratingCount > 0 ? (
                        <RatingInline avg={s.ratingAvg} count={s.ratingCount} />
                      ) : (
                        <span>Chưa có đánh giá</span>
                      )}
                      {s.suspended ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 font-medium text-ink/70">
                          <PauseCircle className="size-3" /> Tạm ngừng bán
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <Package className="size-3.5 text-champagne-600" />
                          {s.productCount.toLocaleString('vi-VN')} sản phẩm
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
                <div className="flex items-center justify-between gap-2 border-t border-dashed border-ivory-200 pt-3">
                  <span className="text-xs text-ink/45">
                    Theo dõi từ {formatDate(s.followedAt)}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-ink/60"
                      disabled={unfollow.isPending && unfollow.variables === s.id}
                      onClick={() => unfollow.mutate(s.id)}
                    >
                      {unfollow.isPending && unfollow.variables === s.id && (
                        <Loader2 className="size-3.5 animate-spin" />
                      )}
                      Bỏ theo dõi
                    </Button>
                    <Button asChild size="sm" variant="outline" className="rounded-lg">
                      <Link to={`/shop/${s.id}`}>Xem shop</Link>
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pager
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => setParams(p > 1 ? { page: String(p) } : {}, { replace: true })}
          />
        </>
      )}
    </div>
  );
}
