import { IconCheck, IconHeart, IconLoader2, IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import type { ProductDetail, PublicShop } from '@/lib/catalog-types';
import type { FollowState, LikeState } from '@/lib/engagement-types';
import { cn } from '@/lib/utils';
import { Stars, formatCount, formatRating } from './stars';

/** Khóa TanStack Query: danh sách yêu thích / shop đang theo dõi (làm mới sau khi bấm tim/theo dõi) */
export const likedProductsKey = ['me', 'liked-products'] as const;
export const followedShopsKey = ['me', 'followed-shops'] as const;

/** Chưa đăng nhập thì sang trang đăng nhập rồi quay lại đúng trang này (như nút thêm vào giỏ) */
function useRequireLogin() {
  const session = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  return {
    session,
    userId: session.status === 'user' ? session.user.id : null,
    /** true: đã đăng nhập, làm tiếp được */
    check: () => {
      if (session.status === 'loading') return false;
      if (session.status === 'guest') {
        const returnTo = location.pathname + location.search;
        navigate(`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`);
        return false;
      }
      return true;
    },
  };
}

/**
 * Trạng thái của chính người xem (đã thả tim / đang theo dõi) lấy lại khi biết đã đăng nhập: trang công khai
 * có thể đã tải trước lúc phiên đăng nhập sẵn sàng.
 */
function useViewerState<T>(key: readonly unknown[], path: string, userId: string | null) {
  return useQuery({
    queryKey: [...key, userId],
    queryFn: () => api<T>(path),
    enabled: !!userId,
    staleTime: 0,
  });
}

/**
 * Dòng ngay dưới tên sản phẩm: sao trung bình (bấm để xuống phần đánh giá), số đánh giá và nút tim.
 * Đặt trong trang sản phẩm bằng một dòng.
 */
export function ProductEngagementBar({
  product,
  extra,
}: {
  product: ProductDetail;
  /** Thêm vào sau phần đánh giá (ví dụ "Đã bán 1,4k") */
  extra?: ReactNode;
}) {
  const { userId, check } = useRequireLogin();
  const qc = useQueryClient();
  const viewer = useViewerState<ProductDetail>(
    ['product-like', product.id],
    `${API.market}/products/${product.id}`,
    userId,
  );
  const state: LikeState = viewer.data
    ? { liked: viewer.data.liked, likeCount: viewer.data.likeCount }
    : { liked: userId ? product.liked : false, likeCount: product.likeCount };

  const toggle = useMutation({
    mutationFn: (like: boolean) =>
      api<LikeState>(`${API.market}/products/${product.id}/like`, {
        method: like ? 'PUT' : 'DELETE',
      }),
    onSuccess: (next) => {
      qc.setQueryData<ProductDetail>(['product-like', product.id, userId], (old) =>
        old ? { ...old, ...next } : old,
      );
      void qc.invalidateQueries({ queryKey: likedProductsKey });
      toast.success(next.liked ? 'Đã thêm vào Sản phẩm yêu thích.' : 'Đã bỏ khỏi yêu thích.');
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
      {product.ratingAvg !== null && product.ratingCount > 0 ? (
        <a
          href="#danh-gia"
          className="group inline-flex items-center gap-2 text-sm text-ink/60 transition hover:text-navy"
        >
          <b className="text-base font-bold text-navy underline-offset-4 group-hover:underline">
            {formatRating(product.ratingAvg)}
          </b>
          <Stars value={product.ratingAvg} starClassName="size-4" />
          <span>({product.ratingCount.toLocaleString('vi-VN')} đánh giá)</span>
        </a>
      ) : (
        <span className="text-sm text-ink/50">Chưa có đánh giá</span>
      )}
      {extra}
      <button
        type="button"
        aria-pressed={state.liked}
        disabled={toggle.isPending}
        onClick={() => check() && toggle.mutate(!state.liked)}
        className={cn(
          'ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-champagne disabled:opacity-60',
          state.liked
            ? 'border-navy/30 bg-champagne-50 text-navy'
            : 'border-ink/15 bg-card text-ink/70 hover:border-navy/40 hover:text-navy',
        )}
        title={state.liked ? 'Bỏ yêu thích' : 'Thêm vào yêu thích'}
      >
        {toggle.isPending ? (
          <IconLoader2 className="size-4 animate-spin" />
        ) : (
          <IconHeart className={cn('size-4', state.liked && 'fill-navy text-navy')} />
        )}
        {state.liked ? 'Đã thích' : 'Yêu thích'}
        {state.likeCount > 0 && (
          <span className="text-xs text-ink/45">({formatCount(state.likeCount)})</span>
        )}
      </button>
    </div>
  );
}

/**
 * Sao shop, số người theo dõi và nút Theo dõi / Đang theo dõi (đầu trang shop). Shop của chính mình thì
 * không hiện nút.
 */
/** `actions`: nút đặt cạnh nút Theo dõi (ví dụ Chat với shop). */
export function ShopEngagement({
  shop,
  actions,
  children,
}: {
  shop: PublicShop;
  actions?: ReactNode;
  /** Trang shop tự xếp bố cục: số người theo dõi (cập nhật khi bấm) và cụm nút */
  children: (parts: { followerCount: number; buttons: ReactNode }) => ReactNode;
}) {
  const { session, userId, check } = useRequireLogin();
  const qc = useQueryClient();
  const viewer = useViewerState<PublicShop>(
    ['shop-follow', shop.id],
    `${API.market}/shops/${shop.id}`,
    userId,
  );
  const current = viewer.data ?? shop;
  const state: FollowState = {
    following: userId ? current.following : false,
    followerCount: current.followerCount,
  };

  const toggle = useMutation({
    mutationFn: (follow: boolean) =>
      api<FollowState>(`${API.market}/shops/${shop.id}/follow`, {
        method: follow ? 'PUT' : 'DELETE',
      }),
    onSuccess: (next) => {
      qc.setQueryData<PublicShop>(['shop-follow', shop.id, userId], (old) =>
        old ? { ...old, ...next } : old,
      );
      void qc.invalidateQueries({ queryKey: followedShopsKey });
      toast.success(next.following ? `Đã theo dõi ${shop.name}.` : 'Đã bỏ theo dõi shop.');
    },
    onError: (e) => toast.error(e.message),
  });

  // Chủ shop xem shop của mình: không tự theo dõi được (409 OWN_SHOP) nên ẩn nút
  const myShop = useMyShop();
  const isOwner = myShop.data?.shop?.id === shop.id;

  return children({
    followerCount: state.followerCount,
    buttons: (
      <div className="flex flex-wrap gap-2">
        {!isOwner && session.status !== 'loading' && (
          <Button
            variant={state.following ? 'outline' : 'default'}
            className="h-10 rounded-lg px-5"
            disabled={toggle.isPending}
            onClick={() => check() && toggle.mutate(!state.following)}
          >
            {toggle.isPending ? (
              <IconLoader2 className="size-4 animate-spin" />
            ) : state.following ? (
              <IconCheck className="size-4" />
            ) : (
              <IconPlus className="size-4" />
            )}
            {state.following ? 'Đang theo dõi' : 'Theo dõi'}
          </Button>
        )}
        {actions}
      </div>
    ),
  });
}
