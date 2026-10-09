import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="text-6xl font-bold text-champagne">404</div>
      <h1 className="mt-4 text-xl font-semibold text-navy">Không tìm thấy trang</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Trang bạn tìm không có hoặc đã được chuyển đi.
      </p>
      <Button asChild className="mt-6 rounded-full px-6">
        <Link to="/">Về trang chủ</Link>
      </Button>
    </div>
  );
}
