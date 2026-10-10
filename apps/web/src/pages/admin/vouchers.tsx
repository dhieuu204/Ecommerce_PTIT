import { VoucherManager } from '@/components/vouchers/voucher-manager';

/** Quản trị › Voucher sàn (VCH-01, bộ quyền FINANCE): sàn chịu phần tiền giảm, mọi thay đổi ghi nhật ký */
export function AdminVouchersPage() {
  return <VoucherManager kind="platform" />;
}
