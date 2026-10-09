import type { LucideIcon } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Ô trống của danh sách: icon tròn champagne + câu ngắn */
export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="flex size-14 items-center justify-center rounded-full bg-champagne-50 text-champagne-600 ring-8 ring-champagne-50/50">
        <Icon className="size-6" />
      </span>
      <div className="mt-4 font-semibold text-navy">{title}</div>
      {text && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Lỗi tải dữ liệu: câu báo + nút thử lại */
export function LoadError({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <EmptyState
      className={className}
      icon={AlertTriangle}
      title="Chưa tải được dữ liệu"
      text={message}
      action={
        onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Thử lại
          </Button>
        )
      }
    />
  );
}
