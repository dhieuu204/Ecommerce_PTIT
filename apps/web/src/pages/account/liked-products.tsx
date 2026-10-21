import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Loader2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { ProductCard, ProductCardSkeleton } from '@/components/catalog/product-card';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { Pager } from '@/components/console/pager';
import { likedProductsKey } from '@/components/reviews/engagement';
import { Button } from '@/components/ui/button';
import { API, api } from '@/lib/api';
import type { LikedProduct } from '@/lib/engagement-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 12;

/** Tài khoản › Sản phẩm yêu thích (ENG-03): thẻ như trang tìm kiếm, hàng không còn bán vẫn hiện để bỏ tim */
export function LikedProductsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: [...likedProductsKey, page],
    queryFn: () =>
      api<Page<LikedProduct>>(`${API.market}/me/liked-products`, {
        query: { page, pageSize: PAGE_SIZE },
      }),
    placeholderData: keepPreviousData,
  });
  const unlike = useMutation({
    mutationFn: (productId: string) =>
      api(`${API.market}/products/${productId}/like`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Đã bỏ khỏi yêu thích.');
      void qc.invalidateQueries({ queryKey: likedProductsKey });
      void qc.invalidateQueries({ queryKey: ['product-like'] });
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5">
        <h1 className="text-lg font-semibold text-navy">Sản phẩm yêu thích</h1>
        <p className="mt-1 text-sm text-ink/60">
          Bấm “Yêu thích” ở trang sản phẩm để lưu lại; mới thả tim hiện trước.
        </p>
      </div>

      {list.isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <ProductCardSkeleton key={i} />
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
          icon={Heart}
          title="Chưa có sản phẩm yêu thích"
          text="Thả tim sản phẩm bạn thích để xem lại và mua sau."
          action={
            <Button asChild variant="outline" className="rounded-full px-5">
              <Link to="/tim-kiem">Khám phá sản phẩm</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div
            className={cn(
              'grid grid-cols-2 gap-3 transition-opacity md:grid-cols-3 xl:grid-cols-4',
              list.isPlaceholderData && 'opacity-60',
            )}
          >
            {list.data.items.map((p) => {
              const removing = unlike.isPending && unlike.variables === p.id;
              return (
                <div key={p.id} className="relative">
                  <ProductCard
                    product={p}
                    className={cn(
                      'h-full',
                      !p.available && 'pointer-events-none opacity-55 grayscale',
                    )}
                  />
                  {!p.available && (
                    <span className="absolute inset-x-0 top-[38%] mx-auto w-fit rounded-full bg-ink/80 px-3 py-1 text-xs font-medium text-white">
                      Không còn bán
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => unlike.mutate(p.id)}
                    disabled={removing}
                    aria-label={`Bỏ yêu thích ${p.name}`}
                    title="Bỏ yêu thích"
                    className="absolute top-2 right-2 z-10 flex size-8 items-center justify-center rounded-full bg-card/95 text-rose-500 shadow-sm ring-1 ring-ivory-200 transition hover:scale-105"
                  >
                    {removing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Heart className="size-4 fill-rose-500" />
                    )}
                  </button>
                </div>
              );
            })}
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
