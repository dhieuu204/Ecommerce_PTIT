import { Link } from 'react-router';

interface PageHeaderProps {
  /** Đường dẫn: [{ label, to? }] */
  crumbs?: Array<{ label: string; to?: string }>;
  title: string;
  description?: string;
  /** Nút hành động chính bên phải */
  actions?: React.ReactNode;
}

/** Đầu trang trong Kênh người bán / Quản trị: đường dẫn + tiêu đề + nút chính */
export function PageHeader({ crumbs, title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {crumbs && (
          <nav className="mb-1 text-xs text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={c.label}>
                {i > 0 && <span className="mx-1.5">›</span>}
                {c.to ? (
                  <Link to={c.to} className="hover:text-navy">
                    {c.label}
                  </Link>
                ) : (
                  c.label
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-semibold text-navy">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
