import {
  IconAlertCircle,
  IconClockHour4,
  IconCoin,
  IconLink,
  IconPlus,
  IconShoppingBag,
  IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { Navigate } from 'react-router';
import { toast } from 'sonner';
import { BankAccountFields, bankRules } from '@/components/bank-account-fields';
import {
  DigitsInput,
  Field,
  inputClass,
  PHONE_PATTERN,
  SubmitButton,
} from '@/components/form-bits';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { MY_AFFILIATE_KEY, useMyAffiliate } from '@/hooks/use-my-affiliate';
import type { Affiliate, MyAffiliate } from '@/lib/affiliate-types';
import { API, api } from '@/lib/api';
import { showApiError, newIdempotencyKey } from '@/lib/form';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CARD, CardTitle } from '@/pages/checkout/checkout-parts';
import { Notice } from '../auth/auth-parts';

interface ApplyForm {
  displayName: string;
  channels: Array<{ url: string }>;
  phone: string;
  bankAccount: { bankName: string; accountNumber: string; accountName: string };
  agree: boolean;
}

const MAX_CHANNELS = 3;

const fromAffiliate = (a: Affiliate | null): ApplyForm => ({
  displayName: a?.displayName ?? '',
  channels: a?.channels.length ? a.channels.map((url) => ({ url })) : [{ url: '' }],
  phone: a?.phone ?? '',
  bankAccount: {
    bankName: a?.bankAccount.bankName ?? '',
    accountNumber: a?.bankAccount.accountNumber ?? '',
    accountName: a?.bankAccount.accountName ?? '',
  },
  agree: false,
});

/** Ba bước hoạt động của cộng tác viên, nói đúng luật đã chốt (P7) */
const STEPS = [
  {
    icon: IconLink,
    title: 'Lấy link sản phẩm',
    text: 'Chọn sản phẩm có hoa hồng, sao chép link rồi chia sẻ trên kênh của bạn.',
  },
  {
    icon: IconShoppingBag,
    title: 'Người mua đặt qua link',
    text: 'Mọi sản phẩm có hoa hồng của shop đó trong đơn đều được tính cho bạn.',
  },
  {
    icon: IconCoin,
    title: 'Nhận hoa hồng',
    text: 'Hoa hồng sang khả dụng khi đơn hoàn tất, rút về tài khoản ngân hàng.',
  },
];

/** Đăng ký cộng tác viên (P7, AFF-01): lần đầu, chờ duyệt, hoặc sửa và nộp lại sau khi bị từ chối */
export function AffiliateApplyPage() {
  const me = useMyAffiliate();
  if (me.isPending) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="mt-4 h-96 rounded-2xl" />
      </div>
    );
  }
  const status = me.data?.status ?? 'NONE';
  if (status === 'ACTIVE' || status === 'SUSPENDED')
    return <Navigate to="/cong-tac-vien" replace />;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <section className={cn(CARD, 'p-5 md:p-7')}>
        <h1 className="text-xl font-bold tracking-tight text-charcoal md:text-2xl">
          Cộng tác viên HK Shop
        </h1>
        <p className="mt-1 text-sm text-ink/60">
          Giới thiệu sản phẩm điện tử của các shop trên sàn và nhận hoa hồng do shop trả.
        </p>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3 sm:flex-col sm:gap-2">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-navy">
                <s.icon className="size-5 [stroke-width:1.75]" />
              </span>
              <div className="text-sm">
                <div className="font-semibold text-charcoal">
                  {i + 1}. {s.title}
                </div>
                <div className="mt-0.5 text-xs leading-relaxed text-ink/60">{s.text}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
      {status === 'PENDING' ? (
        <PendingCard affiliate={me.data!.affiliate!} />
      ) : (
        <ApplyFormCard my={me.data ?? { status: 'NONE', affiliate: null }} />
      )}
    </div>
  );
}

function PendingCard({ affiliate: a }: { affiliate: Affiliate }) {
  return (
    <section className={cn(CARD, 'mt-4 p-5 md:p-7')}>
      <div className="flex gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 ring-1 ring-amber-200">
          <IconClockHour4 className="size-6 [stroke-width:1.75]" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-charcoal">Hồ sơ đang chờ duyệt</h2>
          <p className="mt-1 text-sm text-ink/60">
            Gửi lúc {formatDateTime(a.createdAt)}. Bạn sẽ nhận thông báo và email khi có kết quả.
          </p>
        </div>
      </div>
      <dl className="mt-5 grid gap-x-6 gap-y-3 border-t border-ink/[0.06] pt-5 text-sm sm:grid-cols-2">
        <Info label="Tên hiển thị">{a.displayName}</Info>
        <Info label="Số điện thoại">{a.phone}</Info>
        <Info label="Kênh bán hàng" wide>
          <ul className="space-y-0.5">
            {a.channels.map((c) => (
              <li key={c} className="truncate">
                {c}
              </li>
            ))}
          </ul>
        </Info>
        <Info label="Tài khoản nhận tiền" wide>
          {a.bankAccount.bankName} · {a.bankAccount.accountNumber} · {a.bankAccount.accountName}
        </Info>
      </dl>
    </section>
  );
}

function Info({
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

function ApplyFormCard({ my }: { my: MyAffiliate }) {
  const qc = useQueryClient();
  const rejected = my.status === 'REJECTED';
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ApplyForm>({ defaultValues: fromAffiliate(rejected ? my.affiliate : null) });
  const channels = useFieldArray({ control, name: 'channels' });
  // Mã chống gửi lặp: giữ nguyên khi bấm lại cùng nội dung, đổi sau mỗi lần gửi thành công
  const key = useRef(newIdempotencyKey());

  const onSubmit = handleSubmit(async (f) => {
    try {
      await api<MyAffiliate>(`${API.market}/affiliates/me/application`, {
        method: 'POST',
        idempotencyKey: key.current,
        body: {
          displayName: f.displayName.trim(),
          channels: f.channels.map((c) => c.url.trim()).filter(Boolean),
          phone: f.phone,
          bankAccount: f.bankAccount,
        },
      });
      key.current = newIdempotencyKey();
      toast.success('Đã gửi hồ sơ cộng tác viên, chờ sàn duyệt.');
      await qc.invalidateQueries({ queryKey: MY_AFFILIATE_KEY });
    } catch (e) {
      showApiError(e, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} className={cn(CARD, 'mt-4 space-y-6 p-5 md:p-7')} noValidate>
      <CardTitle>{rejected ? 'Sửa hồ sơ và nộp lại' : 'Hồ sơ cộng tác viên'}</CardTitle>
      {rejected && my.affiliate?.rejectReason && (
        <Notice tone="danger" icon={<IconAlertCircle />}>
          <p>
            <span className="font-medium">Hồ sơ trước bị từ chối:</span> {my.affiliate.rejectReason}
          </p>
        </Notice>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="displayName"
          label="Tên hiển thị"
          error={errors.displayName?.message}
          hint="Shop thấy tên này ở đơn đặt qua link của bạn."
        >
          <input
            id="displayName"
            className={inputClass}
            placeholder="Ví dụ: Review Công Nghệ"
            aria-invalid={!!errors.displayName}
            {...register('displayName', {
              validate: (x) => {
                const n = x.trim().length;
                return (n >= 2 && n <= 60) || 'Tên hiển thị từ 2 đến 60 ký tự.';
              },
            })}
          />
        </Field>
        <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
          <DigitsInput
            id="phone"
            placeholder="0912345678"
            maxLength={10}
            aria-invalid={!!errors.phone}
            {...register('phone', {
              required: 'Vui lòng nhập số điện thoại.',
              pattern: { value: PHONE_PATTERN, message: 'Số điện thoại gồm số 0 và 9 chữ số.' },
            })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-charcoal">Kênh bán hàng</span>
          <span className="text-xs text-muted-foreground">
            Trang Facebook, TikTok, YouTube hoặc website, tối đa {MAX_CHANNELS} kênh
          </span>
        </div>
        {channels.fields.map((field, i) => (
          <div key={field.id}>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="https://www.tiktok.com/@kenh-cua-ban"
                aria-label={`Kênh ${i + 1}`}
                aria-invalid={!!errors.channels?.[i]?.url}
                {...register(`channels.${i}.url`, {
                  validate: (x) =>
                    /^https?:\/\/\S+\.\S+/.test(x.trim()) ||
                    'Nhập đường dẫn bắt đầu bằng http:// hoặc https://.',
                })}
              />
              {channels.fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => channels.remove(i)}
                  aria-label={`Bỏ kênh ${i + 1}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-ink/50 transition hover:bg-red-50 hover:text-red-600"
                >
                  <IconTrash className="size-[1.125rem]" />
                </button>
              )}
            </div>
            {errors.channels?.[i]?.url && (
              <p className="mt-1 text-xs text-destructive">{errors.channels[i]!.url!.message}</p>
            )}
          </div>
        ))}
        {channels.fields.length < MAX_CHANNELS && (
          <button
            type="button"
            onClick={() => channels.append({ url: '' })}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-navy hover:underline"
          >
            <IconPlus className="size-4" /> Thêm kênh
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium text-charcoal">Tài khoản nhận hoa hồng</div>
          <p className="text-xs text-muted-foreground">
            Mỗi lần rút tiền đều được sàn duyệt; đổi tài khoản sau này không cần duyệt lại hồ sơ.
          </p>
        </div>
        <BankAccountFields
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
      </div>

      <div className="space-y-4 rounded-xl border border-champagne/40 bg-champagne-50/50 p-4">
        <Controller
          control={control}
          name="agree"
          rules={{ validate: (x) => x || 'Bạn cần đồng ý để nộp hồ sơ.' }}
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <Checkbox
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  aria-invalid={!!fieldState.error}
                  className="mt-0.5 size-5 rounded-[5px] bg-white data-[state=checked]:border-navy data-[state=checked]:bg-navy"
                />
                <span>
                  Tôi hiểu hoa hồng chỉ tính cho đơn hoàn tất; đơn hủy, giao thất bại hoặc trả hàng
                  thì hoa hồng được trừ tương ứng. Tự mua qua link của mình không có hoa hồng.
                </span>
              </label>
              {fieldState.error && (
                <p className="pl-8 text-xs text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />
        <SubmitButton pending={isSubmitting} className="w-full sm:w-auto">
          {rejected ? 'Nộp lại hồ sơ' : 'Gửi hồ sơ'}
        </SubmitButton>
      </div>
    </form>
  );
}
