import { forwardRef } from 'react';
import type { Icon, IconProps } from '@tabler/icons-react';

/**
 * Bộ icon danh mục riêng của HK Shop (tự vẽ, không lấy của trang khác): khung 24px, nét 1.3, đầu nét và
 * góc nối bo tròn, góc hộp bo lớn, hình đúng món hàng. Cùng kiểu props với icon Tabler (size, stroke,
 * className) để dùng chung chỗ với CATEGORY_ICONS.
 */
function makeIcon(name: string, body: React.ReactNode) {
  const C = forwardRef<SVGSVGElement, IconProps>(
    ({ size = 24, stroke = 1.3, color = 'currentColor', className, ...rest }, ref) => (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={['hk-icon', className].filter(Boolean).join(' ')}
        {...(rest as React.SVGProps<SVGSVGElement>)}
      >
        {body}
      </svg>
    ),
  );
  C.displayName = name;
  return C as unknown as Icon;
}

/** Điện thoại: thân bo lớn, "đảo" camera phía trên */
export const HkPhone = makeIcon(
  'HkPhone',
  <>
    <rect x="6" y="2" width="12" height="20" rx="3.6" />
    <path d="M10.4 4.9h3.2" />
  </>,
);

/** Máy tính bảng: thân dọc rộng, thanh vuốt phía dưới */
export const HkTablet = makeIcon(
  'HkTablet',
  <>
    <rect x="3.8" y="2.5" width="16.4" height="19" rx="3" />
    <path d="M10.2 18.8h3.6" />
  </>,
);

/** Laptop: màn bo góc, đế mỏng dài hơn màn */
export const HkLaptop = makeIcon(
  'HkLaptop',
  <>
    <rect x="4" y="4.5" width="16" height="11.5" rx="2.4" />
    <rect x="1.8" y="18" width="20.4" height="1.9" rx="0.95" />
    <path d="M11 6.6h2" />
  </>,
);

/** Màn hình & PC: màn bo góc, cổ chân đứng, đế ngang */
export const HkMonitor = makeIcon(
  'HkMonitor',
  <>
    <rect x="2.5" y="3.5" width="19" height="12.5" rx="2.4" />
    <path d="M12 16v3.6" />
    <path d="M8 20.2h8" />
  </>,
);

/** Gaming: tay cầm hai tay nắm, phím chữ thập bên trái, 2 nút tròn bên phải */
export const HkGamepad = makeIcon(
  'HkGamepad',
  <>
    <path d="M7.2 6.5h9.6a4.6 4.6 0 0 1 4.5 3.7l.9 4.6a2.9 2.9 0 0 1-5.1 2.4L15.3 15H8.7l-1.8 2.2a2.9 2.9 0 0 1-5.1-2.4l.9-4.6a4.6 4.6 0 0 1 4.5-3.7Z" />
    <path d="M7.8 9.4v3.2M6.2 11h3.2" />
    <path d="M15.6 10.2h.01M17.6 11.9h.01" strokeWidth={2.2} />
  </>,
);

/** Đồng hồ thông minh: mặt vuông bo, dây trên dưới, núm vặn */
export const HkWatch = makeIcon(
  'HkWatch',
  <>
    <rect x="5.5" y="6" width="12" height="12" rx="3.4" />
    <path d="M8.5 6V3.6c0-.5.4-.9.9-.9h4.2c.5 0 .9.4.9.9V6" />
    <path d="M8.5 18v2.4c0 .5.4.9.9.9h4.2c.5 0 .9-.4.9-.9V18" />
    <path d="M17.5 10.2h.9c.4 0 .7.3.7.7v.9c0 .4-.3.7-.7.7h-.9" />
    <path d="M11.5 9.6V12l1.6 1.2" />
  </>,
);

/** Âm thanh: tai nghe chụp tai, chụp tai bo tròn */
export const HkHeadphones = makeIcon(
  'HkHeadphones',
  <>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
    <rect x="3" y="13.4" width="4.4" height="7.4" rx="2.2" />
    <rect x="16.6" y="13.4" width="4.4" height="7.4" rx="2.2" />
  </>,
);

/** Phụ kiện: củ sạc có chân cắm và dây */
export const HkCharger = makeIcon(
  'HkCharger',
  <>
    <rect x="6" y="7.5" width="12" height="9.5" rx="3" />
    <path d="M10 7.5V4M14 7.5V4" />
    <path d="M12 17v1.6a2.4 2.4 0 0 0 2.4 2.4H19" />
    <path d="M10.8 11.3h2.4" />
  </>,
);

/** Thời trang: áo thun cổ tròn */
export const HkShirt = makeIcon(
  'HkShirt',
  <path d="M8.6 3.4 4.3 5.6a1 1 0 0 0-.5 1.2l1.2 3.3a.8.8 0 0 0 1 .5l1.4-.5v9.5c0 .6.4 1 1 1h7.2c.6 0 1-.4 1-1V10.1l1.4.5a.8.8 0 0 0 1-.5l1.2-3.3a1 1 0 0 0-.5-1.2l-4.3-2.2c-.5 1.6-1.9 2.6-3.6 2.6s-3.1-1-3.4-2.6Z" />,
);

/** Nhà cửa: ngôi nhà mái dốc, cửa vòm */
export const HkHouse = makeIcon(
  'HkHouse',
  <>
    <path d="M3.8 10.4 11.1 4.2a1.4 1.4 0 0 1 1.8 0l7.3 6.2" />
    <path d="M5.6 9v10a1.6 1.6 0 0 0 1.6 1.6h9.6a1.6 1.6 0 0 0 1.6-1.6V9" />
    <path d="M10 20.6v-4a2 2 0 0 1 4 0v4" />
  </>,
);

/** Làm đẹp: lọ serum có ống nhỏ giọt */
export const HkSerum = makeIcon(
  'HkSerum',
  <>
    <rect x="7" y="10" width="10" height="11.4" rx="2.6" />
    <path d="M9.6 10V8.1c0-.3.3-.6.6-.6h3.6c.3 0 .6.3.6.6V10" />
    <path d="M10.6 7.5V4.3a1.4 1.4 0 0 1 2.8 0v3.2" />
    <path d="M9.8 14.6h4.4" />
  </>,
);
