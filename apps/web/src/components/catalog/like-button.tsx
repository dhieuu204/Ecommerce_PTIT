import { IconHeart, IconHeartFilled, IconLoader2 } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { likedProductsKey } from '@/components/reviews/engagement';
import { API, api } from '@/lib/api';
import { useSession } from '@/lib/auth';
import type { LikedProduct, LikeState } from '@/lib/engagement-types';
import type { Page } from '@/lib/types';
import { cn } from '@/lib/utils';

/**
 * Mã các sản phẩm người xem đã thả tim (GET /me/liked-products, lấy tối đa 100 cái mới nhất, đủ cho trang
 * chủ và danh sách). Chưa đăng nhập thì rỗng. Nằm dưới khóa likedProductsKey nên bấm tim ở bất cứ đâu cũng
 * làm mới.
 */
function useLikedIds() {
  const session = useSession();
  const userId = session.status === 'user' ? session.user.id : null;
  const q = useQuery({
    queryKey: [...likedProductsKey, 'ids', userId],
    queryFn: () =>
      api<Page<LikedProduct>>(`${API.market}/me/liked-products`, {
        query: { page: 1, pageSize: 100 },
      }),
    enabled: !!userId,
    staleTime: 60_000,
    select: (page) => new Set(page.items.map((p) => p.id)),
  });
  return { session, liked: q.data };
}

/** Nút tim tròn trên thẻ sản phẩm (ENG-03): thả/bỏ tim, chưa đăng nhập thì sang trang đăng nhập */
export function LikeButton({
  productId,
  productName,
  className,
}: {
  productId: string;
  productName: string;
  className?: string;
}) {
  const { session, liked } = useLikedIds();
  const isLiked = liked?.has(productId) ?? false;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const toggle = useMutation({
    mutationFn: (like: boolean) =>
      api<LikeState>(`${API.market}/products/${productId}/like`, {
        method: like ? 'PUT' : 'DELETE',
      }),
    onSuccess: (next) => {
      void qc.invalidateQueries({ queryKey: likedProductsKey });
      void qc.invalidateQueries({ queryKey: ['product-like', productId] });
      toast.success(next.liked ? 'Đã thêm vào Sản phẩm yêu thích.' : 'Đã bỏ khỏi yêu thích.');
    },
    onError: (e) => toast.error(e.message),
  });

  const onClick = () => {
    if (session.status === 'loading') return;
    if (session.status === 'guest') {
      const returnTo = location.pathname + location.search;
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    toggle.mutate(!isLiked);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={toggle.isPending}
      aria-pressed={isLiked}
      aria-label={isLiked ? `Bỏ yêu thích ${productName}` : `Yêu thích ${productName}`}
      title={isLiked ? 'Bỏ yêu thích' : 'Yêu thích'}
      className={cn(
        'flex size-8 items-center justify-center rounded-full transition hover:scale-110 focus-visible:ring-2 focus-visible:ring-champagne focus-visible:outline-none active:scale-95 disabled:opacity-60',
        isLiked ? 'text-navy' : 'text-ink/35 hover:text-navy',
        className,
      )}
    >
      {toggle.isPending ? (
        <IconLoader2 className="size-5 animate-spin" />
      ) : isLiked ? (
        <IconHeartFilled className="size-[1.375rem]" />
      ) : (
        <IconHeart className="size-[1.375rem] [stroke-width:1.5]" />
      )}
    </button>
  );
}
