import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { BankAccountFields, bankRules } from '@/components/bank-account-fields';
import { SubmitButton } from '@/components/form-bits';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Skeleton } from '@/components/ui/skeleton';
import { MY_AFFILIATE_KEY, useMyAffiliate } from '@/hooks/use-my-affiliate';
import type { Affiliate, MyAffiliate } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import { showApiError } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CARD, CardTitle } from '@/pages/checkout/checkout-parts';

interface BankForm {
  bankAccount: { bankName: string; accountNumber: string; accountName: string };
}

/** Khu Cộng tác viên › Hồ sơ (P7, AFF-01, AFF-05): thông tin đã duyệt, đổi tài khoản nhận tiền */
export function AffiliateProfilePage() {
  const me = useMyAffiliate();
  const a = me.data?.affiliate;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader crumbs={[{ label: 'Tài khoản' }]} title="Hồ sơ cộng tác viên" />
      {!a ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : (
        <div className="space-y-4">
          <section className={cn(CARD, 'p-5 md:p-7')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Thông tin</CardTitle>
              <StatusBadge tone={a.status === 'ACTIVE' ? 'success' : 'pending'}>
                {a.status === 'ACTIVE' ? 'Đang hoạt động' : 'Đang bị khóa'}
              </StatusBadge>
            </div>
            <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <Item label="Tên hiển thị">{a.displayName}</Item>
              <Item label="Mã cộng tác viên">
                <span className="font-mono tracking-[0.15em]">{a.code}</span>
              </Item>
              <Item label="Số điện thoại">{a.phone}</Item>
              <Item label="Được duyệt lúc">
                {a.approvedAt ? formatDateTime(a.approvedAt) : '—'}
              </Item>
              <Item label="Kênh bán hàng" wide>
                <ul className="space-y-0.5">
                  {a.channels.map((c) => (
                    <li key={c} className="truncate">
                      <a
                        href={c}
                        target="_blank"
                        rel="noreferrer"
                        className="text-navy hover:underline"
                      >
                        {c}
                      </a>
                    </li>
                  ))}
                </ul>
              </Item>
            </dl>
          </section>
          <BankCard affiliate={a} />
        </div>
      )}
    </div>
  );
}

function Item({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', wide && 'sm:col-span-2')}>
      <dt className="text-xs text-ink/55">{label}</dt>
      <dd className="mt-0.5 font-medium break-words text-charcoal">{children}</dd>
    </div>
  );
}

function BankCard({ affiliate: a }: { affiliate: Affiliate }) {
  const qc = useQueryClient();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<BankForm>({ defaultValues: { bankAccount: a.bankAccount } });
  const onSubmit = handleSubmit(async (f) => {
    try {
      const res = await api<MyAffiliate>(`${API.market}/affiliates/me/bank-account`, {
        method: 'PATCH',
        body: f,
      });
      reset({ bankAccount: res.affiliate!.bankAccount });
      await qc.invalidateQueries({ queryKey: MY_AFFILIATE_KEY });
      toast.success('Đã đổi tài khoản nhận tiền.');
    } catch (e) {
      showApiError(e, setError);
    }
  });
  return (
    <form onSubmit={onSubmit} className={cn(CARD, 'space-y-5 p-5 md:p-7')} noValidate>
      <div>
        <CardTitle>Tài khoản nhận hoa hồng</CardTitle>
        <p className="mt-1.5 text-sm text-ink/60">
          Đổi ngay, không cần duyệt lại; không đổi được khi đang có yêu cầu rút tiền chưa xong.
        </p>
      </div>
      <BankAccountFields
        idPrefix="ctv-bank"
        fields={{
          bankName: register('bankAccount.bankName', bankRules.bankName),
          accountNumber: register('bankAccount.accountNumber', bankRules.accountNumber),
          accountName: register('bankAccount.accountName', bankRules.accountName),
        }}
        errors={{
          bankName: errors.bankAccount?.bankName?.message,
          accountNumber: errors.bankAccount?.accountNumber?.message,
          accountName: errors.bankAccount?.accountName?.message,
        }}
      />
      <SubmitButton pending={isSubmitting} disabled={!isDirty}>
        Lưu tài khoản
      </SubmitButton>
    </form>
  );
}
