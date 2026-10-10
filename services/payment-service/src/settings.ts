import type { SettingDefinition } from '@san/nest-common';

/** Khóa cấu hình của payment-service (bảng settings, admin sửa ở trang Cấu hình chính sách) */
export const PaymentSetting = {
  platformFeeRate: 'platform_fee_percent_x100',
  maxPaymentAttempts: 'max_payment_attempts',
  refundMaxTries: 'refund_max_tries',
} as const;

export const PAYMENT_SETTINGS: SettingDefinition[] = [
  {
    key: PaymentSetting.platformFeeRate,
    label: 'Phí sàn',
    unit: '% × 100',
    description:
      'Tính trên tiền hàng sau voucher shop; 500 = 5,00%. Chụp vào đơn con lúc đặt, đơn cũ không đổi.',
    min: 0,
    max: 5000,
    defaultValue: 500,
  },
  {
    key: PaymentSetting.maxPaymentAttempts,
    label: 'Số lần thanh toán tối đa của một đơn',
    unit: 'lần',
    description: 'Mỗi lần một mã giao dịch VNPay riêng; hết số lần thì đơn hết hạn.',
    min: 1,
    max: 10,
    defaultValue: 3,
  },
  {
    key: PaymentSetting.refundMaxTries,
    label: 'Số lần tự gửi lại lệnh hoàn',
    unit: 'lần',
    description: 'Vẫn lỗi sau số lần này thì chuyển admin tài chính hoàn tay.',
    min: 1,
    max: 10,
    defaultValue: 3,
  },
];
