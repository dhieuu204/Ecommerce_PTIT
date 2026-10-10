import { Link } from 'react-router';
import { BrandLogo } from '@/components/brand-logo';
import { useCategories } from '@/hooks/use-catalog';
import { BRAND } from '@/lib/brand';

type FooterItem = { label: string; to?: string };

/** Mục có `to` là trang đã làm; mục chưa tới giai đoạn chỉ hiện chữ, không bấm được */
const COLUMNS: Array<{ title: string; items: FooterItem[] }> = [
  {
    title: `Về ${BRAND}`,
    items: [
      { label: 'Giới thiệu' },
      { label: 'Điều khoản sử dụng' },
      { label: 'Chính sách bảo mật' },
    ],
  },
  {
    title: 'Chính sách',
    items: [
      { label: 'Thanh toán VNPay, COD' },
      { label: 'Vận chuyển qua GHN' },
      { label: 'Trả hàng và hoàn tiền' },
      { label: 'Phí sàn 5% cho người bán' },
    ],
  },
  {
    title: 'Hỗ trợ khách hàng',
    items: [
      { label: 'Tài khoản của tôi', to: '/tai-khoan/ho-so' },
      { label: 'Quên mật khẩu', to: '/quen-mat-khau' },
      { label: 'Đăng ký bán hàng', to: '/tai-khoan/shop' },
    ],
  },
];

/** Cột "Danh mục": các danh mục cấp 1 (cây danh mục đã tải sẵn cho thanh danh mục) */
function CategoryColumn() {
  const { data } = useCategories();
  if (!data?.length) return null;
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-navy">Danh mục</h3>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-muted-foreground sm:grid-cols-1">
        {data.slice(0, 6).map((c) => (
          <li key={c.id}>
            <Link to={`/danh-muc/${c.slug}`} className="transition hover:text-navy">
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-champagne/30 bg-ivory-200">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-5">
        <CategoryColumn />
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-sm font-semibold text-navy">{col.title}</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {col.items.map((item) => (
                <li key={item.label}>
                  {item.to ? (
                    <Link to={item.to} className="transition hover:text-navy">
                      {item.label}
                    </Link>
                  ) : (
                    item.label
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-navy">Tổng đài hỗ trợ (8h–22h)</h3>
          <p className="text-sm text-muted-foreground">Hotline: 0xxx xxx xxx</p>
          <p className="text-sm text-muted-foreground">Email: hotro@tensan.vn</p>
          <div className="mt-4 flex gap-2">
            {['VNPay', 'COD'].map((m) => (
              <span
                key={m}
                className="rounded-md border border-champagne/50 bg-white px-3 py-1 text-xs font-semibold text-navy"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="border-t border-champagne/20">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-3 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <BrandLogo className="border-navy text-navy hover:bg-navy/5" />
          <p>
            © {new Date().getFullYear()} {BRAND}: đồ án môn học. Môi trường thử: thanh toán sandbox
            (VNPay), vận chuyển môi trường dev (GHN), không trừ tiền thật.
          </p>
        </div>
      </div>
    </footer>
  );
}
