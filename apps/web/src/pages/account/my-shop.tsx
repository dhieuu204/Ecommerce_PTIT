import {
  ArrowRight,
  BadgeCheck,
  Check,
  ChevronDown,
  CircleAlert,
  FileText,
  Hourglass,
  Landmark,
  Info,
  ShieldAlert,
  Percent,
  Store,
  Truck,
} from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Notice } from '../auth/auth-parts';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyShop } from '@/hooks/use-my-shop';
import { BRAND } from '@/lib/brand';
import { formatDate, formatDateTime } from '@/lib/format';
import type { MyShop } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AccountCard } from './account-parts';
import { describeChange, ShopLogo, ShopSummary } from './shop-parts';

/**
 * Shop của tôi (SHP-01, SHP-02; màn hình H2): nội dung đổi theo trạng thái GET /shops/me.
 * NONE: mời mở shop · PENDING: chờ duyệt · REJECTED: lý do + sửa và nộp lại · ACTIVE: vào Kênh người bán.
 * SUSPENDED: admin đình chỉ (P2): lý do + vẫn vào Kênh người bán để sửa hàng.
 */
export function MyShopPage() {
  const shop = useMyShop();

  if (shop.isPending) {
    return (
      <AccountCard title="Shop của tôi">
        <div className="flex gap-5">
          <Skeleton className="size-16 rounded-2xl" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="h-4 w-72 max-w-full" />
            <Skeleton className="h-10 w-44" />
          </div>
        </div>
      </AccountCard>
    );
  }
  if (shop.isError || !shop.data) {
    return (
      <AccountCard title="Shop của tôi">
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>{shop.error?.message ?? 'Chưa tải được thông tin shop.'}</p>
          <Button variant="outline" className="mt-4" onClick={() => shop.refetch()}>
            Thử lại
          </Button>
        </div>
      </AccountCard>
    );
  }

  const data = shop.data;
  switch (data.status) {
    case 'NONE':
      return <InviteCard />;
    case 'PENDING':
      return <PendingCard data={data} />;
    case 'REJECTED':
      return <RejectedCard data={data} />;
    case 'ACTIVE':
      return <ActiveCard data={data} />;
    case 'SUSPENDED':
      return <SuspendedCard data={data} />;
    default:
      return (
        <AccountCard title="Shop của tôi">
          <Notice tone="warning" icon={<CircleAlert />}>
            Shop đang ở trạng thái chưa hỗ trợ trên web. Bạn liên hệ hỗ trợ để biết thêm.
          </Notice>
        </AccountCard>
      );
  }
}

const STEPS = ['Nộp hồ sơ', 'Admin duyệt', 'Bắt đầu bán'];

/** Thanh 3 bước: bước đã xong tích champagne, bước hiện tại viền navy */
function Progress({ current, failed }: { current: 0 | 1 | 2 | 3; failed?: boolean }) {
  return (
    <ol className="flex items-center gap-2 text-xs sm:gap-3 sm:text-sm">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li
            key={label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left"
          >
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1',
                done && 'bg-champagne text-navy ring-champagne',
                active && !failed && 'bg-navy text-white ring-navy',
                active && failed && 'bg-red-600 text-white ring-red-600',
                !done && !active && 'bg-white text-muted-foreground ring-border',
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span
              className={cn(
                'leading-tight sm:truncate',
                active ? 'font-medium text-navy' : done ? 'text-ink' : 'text-muted-foreground',
              )}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span
                className={cn('hidden h-px flex-1 sm:block', done ? 'bg-champagne' : 'bg-border')}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Ô trạng thái lớn: icon tròn + tiêu đề + mô tả + nút */
function StatusPanel({
  tone,
  icon,
  badge,
  title,
  children,
  actions,
}: {
  tone: 'pending' | 'danger' | 'success';
  icon: React.ReactNode;
  badge: string;
  title: React.ReactNode;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  const ring = {
    pending: 'bg-amber-50 text-amber-600 ring-amber-200',
    danger: 'bg-red-50 text-red-600 ring-red-200',
    success: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
  }[tone];
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <span
        className={cn(
          'flex size-14 shrink-0 items-center justify-center rounded-full ring-1 [&_svg]:size-6',
          ring,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <StatusBadge tone={tone}>{badge}</StatusBadge>
        <h2 className="mt-2 text-lg font-semibold break-words text-navy md:text-xl">{title}</h2>
        <div className="mt-1.5 space-y-1 text-sm text-muted-foreground">{children}</div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div>
      </div>
    </div>
  );
}

const primaryBtn = 'h-10 rounded-lg bg-navy px-5 text-white hover:bg-navy-800';

function InviteCard() {
  const perks = [
    { icon: Percent, title: 'Phí sàn 5%', text: 'Chỉ tính trên đơn giao thành công.' },
    { icon: Truck, title: 'Giao qua GHN', text: 'Shipper tới lấy hàng tại địa chỉ của bạn.' },
    {
      icon: Landmark,
      title: 'Rút tiền về ngân hàng',
      text: 'Tiền bán hàng vào tài khoản bạn khai.',
    },
  ];
  const prepare = [
    'Tên shop (không trùng shop khác) và mô tả ngắn',
    'Logo JPG, PNG hoặc WebP',
    'Số điện thoại và địa chỉ lấy hàng',
    'Tài khoản ngân hàng nhận tiền bán hàng',
  ];
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-navy px-6 py-8 text-white shadow-sm md:px-10 md:py-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-champagne/20 blur-3xl"
        />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne/40 px-3 py-1 text-xs text-champagne">
              <Store className="size-3.5" /> Bạn chưa có shop
            </span>
            <h1 className="mt-4 text-2xl font-semibold md:text-3xl">
              Mở shop trên {BRAND} <span className="text-champagne">trong vài phút</span>
            </h1>
            <p className="mt-3 text-sm text-white/75 md:text-base">
              Nộp một hồ sơ duy nhất. Admin duyệt xong là bạn vào Kênh người bán, đăng sản phẩm và
              nhận đơn.
            </p>
          </div>
          <Button
            asChild
            size="lg"
            className="h-12 shrink-0 rounded-full bg-champagne px-7 font-semibold text-navy hover:bg-champagne-600"
          >
            <Link to="/tai-khoan/shop/dang-ky">
              Đăng ký mở shop <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="relative mt-8 grid gap-3 sm:grid-cols-3">
          {perks.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <Icon className="size-5 text-champagne" />
              <div className="mt-2 font-medium">{title}</div>
              <p className="mt-0.5 text-sm text-white/65">{text}</p>
            </div>
          ))}
        </div>
      </section>
      <AccountCard
        title="Chuẩn bị trước khi nộp"
        description="Hồ sơ gồm 3 phần, điền trên một trang."
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {prepare.map((t) => (
            <li key={t} className="flex items-start gap-3 text-sm text-ink">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
                <Check className="size-3.5" />
              </span>
              {t}
            </li>
          ))}
        </ul>
      </AccountCard>
    </div>
  );
}

function PendingCard({ data }: { data: MyShop }) {
  const [open, setOpen] = useState(false);
  const app = data.application;
  return (
    <div className="space-y-6">
      <AccountCard title="Shop của tôi" description="Theo dõi hồ sơ mở shop của bạn.">
        <div className="space-y-7">
          <Progress current={1} />
          <StatusPanel
            tone="pending"
            icon={<Hourglass />}
            badge="Chờ duyệt"
            title="Hồ sơ đang chờ duyệt"
            actions={
              <>
                <Button
                  variant="outline"
                  className="h-10 rounded-lg"
                  onClick={() => setOpen((v) => !v)}
                  aria-expanded={open}
                >
                  <FileText /> {open ? 'Ẩn hồ sơ đã nộp' : 'Xem hồ sơ đã nộp'}
                  <ChevronDown className={cn('transition', open && 'rotate-180')} />
                </Button>
                <Button asChild className={primaryBtn}>
                  <Link to="/tai-khoan/shop/dang-ky">Sửa và nộp lại</Link>
                </Button>
              </>
            }
          >
            {app && (
              <p>
                Phiên bản {app.version} · nộp lúc {formatDateTime(app.submittedAt)}
              </p>
            )}
            <p>Thường được duyệt trong 1 ngày làm việc. Kết quả hiện ngay tại trang này.</p>
          </StatusPanel>
        </div>
      </AccountCard>
      {open && data.shop && (
        <AccountCard title="Hồ sơ đã nộp" description="Nộp lại sẽ thay bản đang chờ.">
          <ShopSummary shop={data.shop} />
        </AccountCard>
      )}
    </div>
  );
}

function RejectedCard({ data }: { data: MyShop }) {
  const app = data.application;
  return (
    <div className="space-y-6">
      <AccountCard title="Shop của tôi" description="Theo dõi hồ sơ mở shop của bạn.">
        <div className="space-y-7">
          <Progress current={1} failed />
          <StatusPanel
            tone="danger"
            icon={<CircleAlert />}
            badge="Bị từ chối"
            title="Hồ sơ chưa được duyệt"
            actions={
              <Button asChild className={primaryBtn}>
                <Link to="/tai-khoan/shop/dang-ky">Sửa và nộp lại</Link>
              </Button>
            }
          >
            {app?.rejectReason && (
              <div className="my-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">
                <span className="font-medium">Lý do: </span>
                {app.rejectReason}
              </div>
            )}
            {app && (
              <p>
                Phiên bản {app.version}
                {app.decidedAt && ` · xét ngày ${formatDate(app.decidedAt)}`}
              </p>
            )}
            <p>Bạn sửa theo lý do trên rồi nộp lại, hồ sơ cũ được giữ nguyên để bạn sửa tiếp.</p>
          </StatusPanel>
        </div>
      </AccountCard>
      {data.shop && (
        <AccountCard title="Hồ sơ đã nộp">
          <ShopSummary shop={data.shop} />
        </AccountCard>
      )}
    </div>
  );
}

function ActiveCard({ data }: { data: MyShop }) {
  const shop = data.shop;
  const app = data.application;
  const change = data.changeRequest;
  return (
    <div className="space-y-6">
      <AccountCard title="Shop của tôi" description="Shop của bạn đã được duyệt.">
        <div className="space-y-6">
          {change?.status === 'PENDING' && (
            <Notice tone="warning" icon={<Hourglass />}>
              Yêu cầu đổi {describeChange(change.change)} đang chờ duyệt (gửi{' '}
              {formatDateTime(change.submittedAt)}). Shop vẫn bán bằng thông tin cũ cho tới khi được
              duyệt.
            </Notice>
          )}
          {change?.status === 'REJECTED' && (
            <Notice tone="danger" icon={<CircleAlert />}>
              Yêu cầu đổi {describeChange(change.change)} không được duyệt
              {change.rejectReason ? `: ${change.rejectReason}` : '.'}
            </Notice>
          )}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <ShopLogo url={shop?.logoUrl ?? null} className="size-20" />
            <div className="min-w-0 flex-1">
              <StatusBadge tone="success">Đang hoạt động</StatusBadge>
              <h2 className="mt-2 text-lg font-semibold break-words text-navy md:text-xl">
                {shop?.name ?? 'Shop của bạn'} đang hoạt động
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {app?.decidedAt && <>Duyệt ngày {formatDate(app.decidedAt)}. </>}
                Vào Kênh người bán để quản lý shop.
              </p>
              <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                <Button asChild className={primaryBtn}>
                  <Link to="/kenh-nguoi-ban">
                    Vào Kênh người bán <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="h-10 rounded-lg">
                  <Link to="/kenh-nguoi-ban/ho-so-shop">Sửa hồ sơ shop</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </AccountCard>
      {shop && (
        <AccountCard
          title="Thông tin shop"
          description={
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <BadgeCheck className="size-3.5 text-emerald-600" /> Đã duyệt
              </span>
              <span className="inline-flex items-center gap-1">
                <Info className="size-3.5" /> Đổi tên shop, tài khoản ngân hàng cần duyệt lại
              </span>
            </span>
          }
        >
          <ShopSummary shop={shop} />
        </AccountCard>
      )}
    </div>
  );
}

/** Shop bị admin đình chỉ (SHP-04): hàng tạm ẩn khỏi sàn, seller vẫn quản lý được hàng và voucher */
function SuspendedCard({ data }: { data: MyShop }) {
  const shop = data.shop;
  return (
    <div className="space-y-6">
      <AccountCard title="Shop của tôi" description="Shop của bạn đang tạm ngừng bán.">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <ShopLogo url={shop?.logoUrl ?? null} className="size-20" />
          <div className="min-w-0 flex-1">
            <StatusBadge tone="pending">Bị đình chỉ</StatusBadge>
            <h2 className="mt-2 text-lg font-semibold break-words text-navy md:text-xl">
              {shop?.name ?? 'Shop của bạn'} đang bị đình chỉ
            </h2>
            <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-700" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium">Hàng của bạn tạm ẩn khỏi sàn.</p>
                {shop?.suspendReason && (
                  <p className="break-words">
                    <span className="font-medium">Lý do:</span> {shop.suspendReason}
                  </p>
                )}
                <p className="text-amber-900/80">
                  Bạn vẫn sửa được sản phẩm, tồn kho và voucher trong Kênh người bán. Hàng hiện lại
                  khi admin khôi phục shop.
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <Button asChild className={primaryBtn}>
                <Link to="/kenh-nguoi-ban">
                  Vào Kênh người bán <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </AccountCard>
      {shop && (
        <AccountCard title="Thông tin shop">
          <ShopSummary shop={shop} />
        </AccountCard>
      )}
    </div>
  );
}
