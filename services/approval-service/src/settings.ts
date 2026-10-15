import type { SettingDefinition } from '@san/nest-common';

/** Khóa cấu hình của approval-service (bảng settings, admin sửa ở trang Cấu hình chính sách) */
export const ApprovalSetting = {
  totalThreshold: 'review_total_threshold',
  codThreshold: 'review_cod_threshold',
  timeoutHours: 'review_timeout_hours',
  disputeSlaHours: 'dispute_sla_hours',
} as const;

export const APPROVAL_SETTINGS: SettingDefinition[] = [
  {
    key: ApprovalSetting.totalThreshold,
    label: 'Đơn tổng từ mức này cần admin duyệt',
    unit: 'đồng',
    description: 'Luật kiểm tra đơn (FLOW-03 quyết định 2). Đơn đúng bằng mức này cũng cần duyệt.',
    min: 100_000,
    max: 1_000_000_000,
    defaultValue: 10_000_000,
  },
  {
    key: ApprovalSetting.codThreshold,
    label: 'Đơn COD từ mức này cần admin duyệt',
    unit: 'đồng',
    description: 'Đơn thanh toán khi nhận hàng có tổng từ mức này thì chờ admin duyệt.',
    min: 100_000,
    max: 1_000_000_000,
    defaultValue: 3_000_000,
  },
  {
    key: ApprovalSetting.timeoutHours,
    label: 'Hạn admin duyệt đơn',
    unit: 'giờ',
    description: 'Không bao giờ tự duyệt: quá hạn thì đơn tự hủy, hoàn tiền nếu đã thu.',
    min: 1,
    max: 168,
    defaultValue: 24,
  },
  {
    key: ApprovalSetting.disputeSlaHours,
    label: 'Hạn admin phân xử tranh chấp trả hàng',
    unit: 'giờ',
    description:
      'Chỉ để nhắc: quá hạn thì lên đầu danh sách và tô đỏ. Không bao giờ tự quyết; tiền seller giữ tới khi có quyết định.',
    min: 1,
    max: 336,
    defaultValue: 72,
  },
];
