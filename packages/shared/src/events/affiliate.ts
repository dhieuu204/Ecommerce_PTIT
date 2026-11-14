/** Sự kiện của cộng tác viên bán hàng (P7: AFF-01). */

/** Hồ sơ CTV lúc nộp. approval-service lưu nguyên bản này để admin xem. */
export interface AffiliateApplicationData {
  displayName: string;
  /** Đường dẫn kênh bán hàng (Facebook, TikTok, YouTube, website), 1–3 kênh */
  channels: string[];
  phone: string;
  /** Chỉ 4 số cuối của số tài khoản */
  bankAccount: { bankName: string; accountNumberMasked: string; accountName: string };
}

/** marketplace-service → approval-service: người dùng nộp (hoặc nộp lại) hồ sơ cộng tác viên. */
export const AFFILIATE_APPLICATION_SUBMITTED = 'affiliate_application.submitted';
export interface AffiliateApplicationSubmittedPayload {
  affiliateId: string;
  /** Tăng dần từ 1; bản mới thay bản cũ đang chờ */
  version: number;
  user: { userId: string; name: string; email: string };
  data: AffiliateApplicationData;
  submittedAt: string;
}

/**
 * approval-service → marketplace-service: quyết định về một CTV.
 * APPROVE/REJECT: duyệt hồ sơ đúng `version`; SUSPEND/RESTORE: khóa/mở CTV đang hoạt động.
 */
export const AFFILIATE_DECIDED = 'affiliate.decided';
export interface AffiliateDecidedPayload {
  affiliateId: string;
  action: 'APPROVE' | 'REJECT' | 'SUSPEND' | 'RESTORE';
  /** Phiên bản hồ sơ với APPROVE/REJECT; null với SUSPEND/RESTORE */
  version: number | null;
  /** Bắt buộc với REJECT, SUSPEND, RESTORE */
  reason: string | null;
  decidedBy: { userId: string; name: string };
  decidedAt: string;
}
