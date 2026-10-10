import { VoucherManager } from '@/components/vouchers/voucher-manager';

/** Kênh người bán › Voucher của shop (VCH-01): shop chịu phần tiền giảm */
export function SellerVouchersPage() {
  return <VoucherManager kind="shop" />;
}
