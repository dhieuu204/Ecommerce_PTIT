import type { SettingDefinition } from '@san/nest-common';

/** Khóa cấu hình của marketplace-service (bảng settings, admin sửa ở trang Cấu hình chính sách) */
export const MarketSetting = {
  paymentMinutes: 'payment_minutes',
  stockHoldMinutes: 'stock_hold_minutes',
  confirmHours: 'confirm_hours',
  shippingFixedFee: 'shipping_fixed_fee',
} as const;

export const MARKET_SETTINGS: SettingDefinition[] = [
  {
    key: MarketSetting.paymentMinutes,
    label: 'Hạn thanh toán đơn trả trước',
    unit: 'phút',
    description: 'Quá hạn chưa trả thì đơn hết hạn (FLOW-02 quyết định 8).',
    min: 1,
    max: 120,
    defaultValue: 15,
    check: (v, all) =>
      v > all[MarketSetting.stockHoldMinutes]!
        ? 'Hạn thanh toán không được dài hơn thời gian giữ tồn.'
        : null,
  },
  {
    key: MarketSetting.stockHoldMinutes,
    label: 'Giữ tồn cho đơn chưa trả',
    unit: 'phút',
    description: 'Hết thời gian này mà chưa trả thì hủy đơn, nhả tồn. Phải ≥ hạn thanh toán.',
    min: 1,
    max: 180,
    defaultValue: 20,
    check: (v, all) =>
      v < all[MarketSetting.paymentMinutes]!
        ? 'Thời gian giữ tồn phải lớn hơn hoặc bằng hạn thanh toán.'
        : null,
  },
  {
    key: MarketSetting.confirmHours,
    label: 'Hạn shop xác nhận đơn',
    unit: 'giờ',
    description: 'Tính từ lúc đơn đã trả và qua kiểm tra. Quá hạn thì tự hủy, hoàn tiền.',
    min: 1,
    max: 168,
    defaultValue: 24,
  },
  {
    key: MarketSetting.shippingFixedFee,
    label: 'Phí ship cố định / dự phòng mỗi đơn con',
    unit: 'đồng',
    description: 'Dùng khi chưa nối GHN, hoặc GHN lỗi lúc tính phí (sàn chịu chênh lệch).',
    min: 0,
    max: 500_000,
    defaultValue: 30_000,
  },
];
