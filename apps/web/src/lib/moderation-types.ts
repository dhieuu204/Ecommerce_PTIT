// Kiểu dữ liệu báo cáo vi phạm và kiểm duyệt (P6, MOD-01): API của approval-service

export type ReportTarget = 'PRODUCT' | 'SHOP';
export type ReportReason =
  'COUNTERFEIT' | 'PROHIBITED' | 'SCAM' | 'WRONG_INFO' | 'OFFENSIVE' | 'OTHER';
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';
export type ReportDecision = 'REMOVE_PRODUCT' | 'SUSPEND_SHOP' | 'DISMISS';

/** POST /reports, GET /me/reports */
export interface Report {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  /** Tên sản phẩm/shop lúc báo cáo */
  targetName: string;
  /** Ảnh sản phẩm (hoặc logo shop) lúc báo cáo */
  targetImage: string | null;
  shopId: string;
  reason: ReportReason;
  note: string;
  /** Khóa ảnh bằng chứng (report-images/<userId>/<file>): xem qua marketplace, cần đăng nhập */
  images: string[];
  status: ReportStatus;
  /** Ghi chú của admin khi đã xử lý */
  adminNote: string | null;
  handledAt: string | null;
  createdAt: string;
}

/** GET /admin/reports */
export interface AdminReport extends Report {
  reporter: { id: string; name: string };
  /** Chủ shop của đối tượng: admin trùng người này không được xử lý */
  ownerId: string;
  handledByName: string | null;
  /** Số báo cáo đang chờ của cùng đối tượng */
  pendingCount: number;
}

/** Một quyết định: gỡ/khôi phục sản phẩm hoặc đình chỉ/khôi phục shop */
export interface ModerationDecision {
  id: string;
  targetType: ReportTarget;
  targetId: string;
  targetName: string;
  action: 'REMOVE' | 'RESTORE' | 'SUSPEND';
  reason: string;
  decidedBy: string;
  decidedByName: string;
  createdAt: string;
}

/** GET /admin/reports/{reportId}; POST .../resolve trả cùng dạng */
export interface AdminReportDetail extends AdminReport {
  others: AdminReport[];
  history: ModerationDecision[];
  /** Sản phẩm đang bị gỡ (null với báo cáo shop) */
  removed: boolean | null;
  /** Shop của đối tượng đang bị đình chỉ */
  suspended: boolean;
}

/** GET /admin/products/{productId}/violations; POST .../restore trả cùng dạng */
export interface ProductViolations {
  removed: boolean;
  items: ModerationDecision[];
}
