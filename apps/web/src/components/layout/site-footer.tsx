import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { BRAND } from '@/lib/brand';

type FooterItem = { label: string; to?: string };

/** Mục có `to` là trang đã làm; mục chưa có trang chỉ hiện chữ, không bấm được. Mỗi cột 4 dòng cho cân. */
const COLUMNS: Array<{ title: string; items: FooterItem[] }> = [
  {
    title: `Về ${BRAND}`,
    items: [
      { label: 'Giới thiệu' },
      { label: 'Kênh người bán', to: '/tai-khoan/shop' },
      { label: 'Điều khoản sử dụng' },
      { label: 'Chính sách bảo mật' },
    ],
  },
  {
    title: 'Hỗ trợ khách hàng',
    items: [
      { label: 'Tài khoản của tôi', to: '/tai-khoan/ho-so' },
      { label: 'Đơn mua', to: '/tai-khoan/don-mua' },
      { label: 'Giỏ hàng', to: '/gio-hang' },
      { label: 'Quên mật khẩu', to: '/quen-mat-khau' },
    ],
  },
  {
    title: 'Chính sách',
    items: [
      { label: 'Thanh toán VNPay, COD' },
      { label: 'Vận chuyển qua GHN' },
      { label: 'Trả hàng và hoàn tiền' },
      { label: 'Phí sàn cho người bán' },
    ],
  },
  {
    title: 'Dành cho người bán',
    items: [
      { label: 'Đăng ký mở shop', to: '/tai-khoan/shop' },
      { label: 'Kênh người bán', to: '/kenh-nguoi-ban' },
      { label: 'Quản lý đơn hàng', to: '/kenh-nguoi-ban/don-hang' },
      { label: 'Tài chính, rút tiền', to: '/kenh-nguoi-ban/tai-chinh' },
    ],
  },
];

const itemClass = 'text-[13px] text-ink/55';

/** Ô logo đối tác thanh toán / vận chuyển trên nền trắng */
function ServiceBadge({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <span
      title={title}
      className="flex h-9 items-center justify-center rounded-lg bg-card px-2.5 shadow-[0_1px_2px_rgba(15,26,61,0.06)]"
    >
      {children}
    </span>
  );
}

/**
 * Footer khu mua hàng (thiết kế 13-footer): logo và logo thật các đối tác thanh toán, vận chuyển bên dưới; 4
 * cột link mỗi cột 4 dòng; dòng bản quyền. Không đặt câu giới thiệu chung chung hay ghi chú "đồ án / môi
 * trường thử" ở đây (chủ đồ án chốt 02/11/2026); nhãn môi trường thử nằm đúng chỗ thanh toán, vận đơn.
 */
export function SiteFooter() {
  return (
    <footer className="mt-14 border-t border-black/[0.06]">
      <div className="mx-auto grid max-w-7xl gap-x-8 gap-y-8 px-4 pt-10 pb-6 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1fr]">
        <div>
          <BrandLogo tone="dark" />
          {/*
            Logo đối tác (public/partners): VNPay và GHN là logo chính thức; COD là icon "Cash On Delivery"
            của SVG Repo (CC0, svgrepo.com/svg/425138)
          */}
          <h3 className="mt-6 mb-3 text-sm font-semibold text-charcoal">Thanh toán & vận chuyển</h3>
          <div className="flex flex-wrap gap-2">
            <ServiceBadge title="Thanh toán qua VNPay">
              <img src="/partners/vnpay.svg" alt="VNPay" className="h-5 w-auto" />
            </ServiceBadge>
            <ServiceBadge title="Thanh toán khi nhận hàng (COD)">
              <img
                src="/partners/cod.svg"
                alt="Thanh toán khi nhận hàng (COD)"
                className="h-7 w-auto"
              />
            </ServiceBadge>
            <ServiceBadge title="Giao Hàng Nhanh (GHN)">
              <img src="/partners/ghn.webp" alt="Giao Hàng Nhanh" className="h-5 w-auto" />
            </ServiceBadge>
          </div>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-semibold text-charcoal">{col.title}</h3>
            <ul className="space-y-2">
              {col.items.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className={`${itemClass} transition hover:text-navy`}>
                      {item.label}
                    </Link>
                  ) : (
                    <span className={itemClass}>{item.label}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mx-auto max-w-7xl px-4 pb-6 text-center text-xs text-ink/45">
        © {new Date().getFullYear()} {BRAND}
      </p>
    </footer>
  );
}
