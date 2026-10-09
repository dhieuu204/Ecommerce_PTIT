import {
  ArrowRight,
  BadgeCheck,
  CreditCard,
  RotateCcw,
  Store,
  Truck,
  UserPlus,
} from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useMyShop } from '@/hooks/use-my-shop';
import { useSession } from '@/lib/auth';
import { BRAND } from '@/lib/brand';

const PROMISES = [
  {
    icon: Truck,
    title: 'Giao hàng qua GHN',
    text: 'Phí ship tính theo khu vực và cân nặng, theo dõi vận đơn rõ ràng.',
  },
  {
    icon: CreditCard,
    title: 'VNPay hoặc COD',
    text: 'Trả trước qua VNPay hay trả tiền khi nhận hàng, tùy bạn chọn.',
  },
  {
    icon: RotateCcw,
    title: 'Trả hàng, hoàn tiền',
    text: 'Có quy trình trả hàng và sàn đứng ra phân xử khi có khiếu nại.',
  },
  {
    icon: BadgeCheck,
    title: 'Shop được duyệt',
    text: 'Mỗi shop đều qua bước kiểm duyệt hồ sơ trước khi bán.',
  },
];

const SELLER_STEPS = [
  {
    icon: UserPlus,
    title: 'Tạo tài khoản',
    text: 'Đăng ký bằng email hoặc Google trong một phút.',
  },
  {
    icon: Store,
    title: 'Nộp hồ sơ shop',
    text: 'Tên shop, logo, địa chỉ lấy hàng và tài khoản nhận tiền.',
  },
  {
    icon: BadgeCheck,
    title: 'Được duyệt và bán',
    text: 'Admin duyệt xong là bạn vào Kênh người bán ngay.',
  },
];

/**
 * Trang chủ P1. Sản phẩm, danh mục, banner do admin đổi và voucher có từ P2 (docs/so-do/07 mục A);
 * trước đó trang chủ giới thiệu sàn và mời mở shop.
 */
export function HomePage() {
  const session = useSession();
  const shop = useMyShop();
  const loggedIn = session.status === 'user';
  const shopCta =
    shop.data?.status === 'ACTIVE'
      ? { to: '/kenh-nguoi-ban', label: 'Vào Kênh người bán' }
      : { to: loggedIn ? '/tai-khoan/shop' : '/dang-ky', label: 'Mở shop ngay' };

  return (
    <>
      <section className="relative overflow-hidden bg-navy text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-32 size-[28rem] rounded-full bg-champagne/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 left-1/4 size-[22rem] rounded-full bg-navy-800 blur-3xl"
        />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 md:grid-cols-[1.2fr_1fr] md:py-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-champagne/40 px-3 py-1 text-xs tracking-wide text-champagne">
              Sàn thương mại điện tử nhiều shop
            </span>
            <h1 className="mt-5 text-3xl leading-tight font-semibold md:text-5xl">
              Mua sắm từ nhiều shop,
              <br />
              <span className="text-champagne">một giỏ hàng, một lần thanh toán.</span>
            </h1>
            <p className="mt-5 max-w-xl text-white/75">
              {BRAND} kết nối người mua với các shop đã được kiểm duyệt. Đặt hàng từ nhiều shop cùng
              lúc, giao bởi GHN, trả trước qua VNPay hoặc khi nhận hàng.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {!loggedIn && (
                <Button
                  asChild
                  size="lg"
                  className="rounded-full bg-champagne px-7 text-navy hover:bg-champagne-600"
                >
                  <Link to="/dang-ky">
                    Tạo tài khoản <ArrowRight />
                  </Link>
                </Button>
              )}
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/40 bg-transparent px-7 text-white hover:bg-white/10 hover:text-white"
              >
                <Link to={shopCta.to}>{shopCta.label}</Link>
              </Button>
            </div>
          </div>
          <div className="hidden md:block">
            <div className="relative mx-auto aspect-square max-w-sm rounded-[2rem] border border-champagne/30 bg-gradient-to-br from-navy-800 to-navy-900 p-8 shadow-2xl">
              <div className="absolute inset-6 rounded-[1.5rem] border border-dashed border-champagne/30" />
              <div className="relative flex h-full flex-col justify-between">
                <Store className="size-12 text-champagne" />
                <div>
                  <div className="text-sm text-champagne">Dành cho người bán</div>
                  <div className="mt-1 text-2xl font-semibold">Phí sàn 5%</div>
                  <div className="mt-1 text-sm text-white/70">
                    chỉ tính trên đơn giao thành công
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 mx-auto -mt-8 max-w-7xl px-4">
        <div className="grid gap-4 rounded-2xl border bg-card p-5 shadow-lg shadow-navy/5 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
                <Icon className="size-5" />
              </span>
              <div>
                <div className="font-semibold text-navy">{title}</div>
                <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-16">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-navy">Bán hàng cùng {BRAND}</h2>
            <div className="mt-2 h-1 w-16 rounded-full bg-champagne" />
          </div>
          <Link
            to={shopCta.to}
            className="hidden text-sm font-medium text-navy hover:text-champagne-600 sm:block"
          >
            {shopCta.label} ›
          </Link>
        </div>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {SELLER_STEPS.map(({ icon: Icon, title, text }, i) => (
            <li
              key={title}
              className="relative rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span className="absolute top-5 right-5 text-4xl font-bold text-champagne/25">
                {i + 1}
              </span>
              <Icon className="size-7 text-navy" />
              <div className="mt-4 font-semibold text-navy">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
