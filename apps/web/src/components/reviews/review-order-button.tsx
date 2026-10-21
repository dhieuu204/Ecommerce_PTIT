import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Nút "Đánh giá" ở đơn con đã hoàn tất (chi tiết đơn mua): mở trang Đánh giá của tôi */
export function ReviewOrderButton({ status }: { status: string }) {
  if (status !== 'COMPLETED') return null;
  return (
    <Button asChild size="sm" className="rounded-lg">
      <Link to="/tai-khoan/danh-gia">
        <Star className="size-4" /> Đánh giá
      </Link>
    </Button>
  );
}
