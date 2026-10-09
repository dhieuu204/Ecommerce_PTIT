import { useQuery } from '@tanstack/react-query';
import { API, api } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';

export const PROFILE_KEY = ['me'] as const;

/** Hồ sơ của tôi (GET /me) */
export function useProfile() {
  const user = useCurrentUser();
  return useQuery({
    queryKey: [...PROFILE_KEY, user?.id],
    queryFn: () => api<Profile>(`${API.user}/me`),
    enabled: !!user,
  });
}

/** Thẻ trắng bo tròn của khu Tài khoản: tiêu đề navy + mô tả + nút bên phải */
export function AccountCard({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('rounded-2xl border bg-card shadow-sm', className)}>
      <header className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between md:px-7 md:py-5">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-navy">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </header>
      <div className="px-5 py-5 md:px-7 md:py-6">{children}</div>
    </section>
  );
}

/** Tiêu đề đánh số trong form dài: ① Thông tin shop */
export function SectionTitle({
  id,
  index,
  title,
  description,
}: {
  id?: string;
  index: number;
  title: string;
  description?: string;
}) {
  return (
    <div id={id} className="flex scroll-mt-32 items-start gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy text-sm font-semibold text-champagne">
        {index}
      </span>
      <div>
        <h2 className="text-base font-semibold text-navy md:text-lg">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

/** Dòng nhãn – giá trị trong thẻ tóm tắt */
export function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm break-words text-ink">{children}</dd>
    </div>
  );
}
