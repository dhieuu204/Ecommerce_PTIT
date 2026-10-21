import { Loader2, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { openConversation } from '@/hooks/use-chat';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import type { ChatAttach } from '@/lib/chat-types';
import { cn } from '@/lib/utils';

/**
 * Nút "Chat với shop" (MSG-01) ở trang sản phẩm, trang shop, chi tiết đơn. Mở (hoặc lấy lại) cuộc
 * trò chuyện rồi sang /tin-nhan/:id; có productId/shopOrder thì trang chat hỏi có gửi thẻ đó không.
 * Chưa đăng nhập: sang đăng nhập rồi quay lại trang này. Shop của chính mình: không hiện.
 */
export function ChatWithShopButton({
  shopId,
  productId,
  shopOrder,
  className,
  size = 'default',
}: {
  shopId: string;
  productId?: string;
  shopOrder?: { id: string; code: string };
  className?: string;
  size?: 'default' | 'sm' | 'lg';
}) {
  const session = useSession();
  const myShop = useMyShop();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  if (session.status === 'loading') return null;
  if (myShop.data?.shop?.id === shopId) return null;

  const onClick = async () => {
    if (session.status !== 'user') {
      const back = location.pathname + location.search;
      navigate(`/dang-nhap?returnTo=${encodeURIComponent(back)}`);
      return;
    }
    setBusy(true);
    try {
      const conv = await openConversation(shopId);
      const attach: ChatAttach | undefined = shopOrder
        ? { kind: 'ORDER', shopOrderId: shopOrder.id, code: shopOrder.code }
        : productId
          ? { kind: 'PRODUCT', productId }
          : undefined;
      navigate(`/tin-nhan/${conv.id}`, { state: attach ? { attach } : null });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Chưa mở được cuộc trò chuyện.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      disabled={busy}
      onClick={() => void onClick()}
      className={cn('border-navy text-navy', className)}
    >
      {busy ? <Loader2 className="animate-spin" /> : <MessageCircle />}
      Chat với shop
    </Button>
  );
}
