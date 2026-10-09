import { useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, CalendarDays, Mail } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field, inputClass, PHONE_PATTERN, SubmitButton } from '@/components/form-bits';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import { API, api, refreshSession } from '@/lib/api';
import { showApiError } from '@/lib/form';
import { formatDate } from '@/lib/format';
import type { Profile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { AccountCard, PROFILE_KEY, useProfile } from './account-parts';

interface ProfileForm {
  fullName: string;
  phone: string;
  birthday: string;
  gender: '' | 'MALE' | 'FEMALE' | 'OTHER';
}

const toForm = (p: Profile): ProfileForm => ({
  fullName: p.fullName,
  phone: p.phone ?? '',
  birthday: p.birthday ?? '',
  gender: p.gender ?? '',
});

const GENDERS = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
] as const;

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD (chặn chọn ngày sinh ở tương lai) */
const todayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });

/** Hồ sơ của tôi (ACC-04, màn hình F): họ tên, SĐT, ngày sinh, giới tính. Email không đổi ở P1. */
export function ProfilePage() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileForm>({
    defaultValues: { fullName: '', phone: '', birthday: '', gender: '' },
  });

  useEffect(() => {
    if (profile.data) reset(toForm(profile.data));
  }, [profile.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      const saved = await api<Profile>(`${API.user}/me`, {
        method: 'PATCH',
        body: {
          fullName: v.fullName.trim(),
          phone: v.phone.trim() || null,
          birthday: v.birthday || null,
          gender: v.gender || null,
        },
      });
      queryClient.setQueryData([...PROFILE_KEY, saved.id], saved);
      reset(toForm(saved));
      toast.success('Đã lưu hồ sơ.');
      // Vé đăng nhập mang họ tên: lấy vé mới để header hiện tên mới
      if (saved.fullName !== profile.data?.fullName) void refreshSession();
    } catch (e) {
      showApiError(e, setError);
    }
  });

  if (profile.isPending) return <ProfileSkeleton />;
  if (profile.isError || !profile.data) {
    return (
      <AccountCard title="Hồ sơ của tôi">
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>{profile.error?.message ?? 'Chưa tải được hồ sơ.'}</p>
          <Button variant="outline" className="mt-4" onClick={() => profile.refetch()}>
            Thử lại
          </Button>
        </div>
      </AccountCard>
    );
  }
  const p = profile.data;

  return (
    <AccountCard title="Hồ sơ của tôi" description="Thông tin dùng khi giao hàng và liên hệ.">
      <div className="grid gap-8 lg:grid-cols-[1fr_240px]">
        <form onSubmit={onSubmit} noValidate className="order-2 space-y-5 lg:order-1">
          <Field id="fullName" label="Họ tên" error={errors.fullName?.message}>
            <input
              id="fullName"
              autoComplete="name"
              className={inputClass}
              aria-invalid={!!errors.fullName}
              {...register('fullName', {
                validate: (x) => !!x.trim() || 'Vui lòng nhập họ tên.',
                maxLength: { value: 100, message: 'Họ tên tối đa 100 ký tự.' },
              })}
            />
          </Field>
          <Field id="email" label="Email" hint="Chưa đổi được email ở giai đoạn này.">
            <div className="relative">
              <input
                id="email"
                value={p.email}
                readOnly
                disabled
                className={cn(inputClass, 'pr-32')}
              />
              {p.status === 'ACTIVE' && (
                <span className="absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-emerald-700">
                  <BadgeCheck className="size-3.5" /> Đã xác minh
                </span>
              )}
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="Ví dụ: 0912345678"
                className={inputClass}
                aria-invalid={!!errors.phone}
                {...register('phone', {
                  validate: (x) =>
                    !x.trim() ||
                    PHONE_PATTERN.test(x.trim()) ||
                    'Số điện thoại gồm số 0 và 9 chữ số.',
                })}
              />
            </Field>
            <Field id="birthday" label="Ngày sinh" error={errors.birthday?.message}>
              <input
                id="birthday"
                type="date"
                max={todayVN()}
                className={inputClass}
                aria-invalid={!!errors.birthday}
                {...register('birthday', {
                  validate: (x) => !x || x <= todayVN() || 'Ngày sinh không được ở tương lai.',
                })}
              />
            </Field>
          </div>
          <Field id="gender" label="Giới tính" error={errors.gender?.message}>
            <Controller
              control={control}
              name="gender"
              render={({ field }) => (
                <RadioGroup
                  id="gender"
                  value={field.value}
                  onValueChange={field.onChange}
                  className="flex flex-wrap gap-2"
                >
                  {GENDERS.map((g) => (
                    <label
                      key={g.value}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm transition',
                        field.value === g.value
                          ? 'border-champagne bg-champagne-50 font-medium text-navy'
                          : 'border-input bg-white hover:border-champagne/60',
                      )}
                    >
                      <RadioGroupItem value={g.value} className="border-navy/40 text-navy" />
                      {g.label}
                    </label>
                  ))}
                </RadioGroup>
              )}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <SubmitButton pending={isSubmitting} disabled={!isDirty}>
              Lưu thay đổi
            </SubmitButton>
            {isDirty && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => reset(toForm(p))}
                disabled={isSubmitting}
              >
                Hủy thay đổi
              </Button>
            )}
          </div>
        </form>

        <aside className="order-1 flex items-center gap-4 rounded-2xl border border-champagne/30 bg-gradient-to-b from-champagne-50 to-white p-4 lg:order-2 lg:flex-col lg:gap-3 lg:self-start lg:px-5 lg:py-6 lg:text-center">
          <UserAvatar name={p.fullName} className="size-16 text-xl ring-4 lg:size-24 lg:text-3xl" />
          <div className="min-w-0 space-y-2 lg:space-y-3">
            <div>
              <div className="font-semibold break-words text-navy">{p.fullName}</div>
              <div className="mt-0.5 text-xs break-all text-muted-foreground">{p.email}</div>
            </div>
            <div className="flex flex-wrap gap-1.5 lg:justify-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-ink ring-1 ring-border">
                <Mail className="size-3" />{' '}
                {p.hasPassword ? 'Email + mật khẩu' : 'Chưa đặt mật khẩu'}
              </span>
              {p.hasGoogle && (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs text-ink ring-1 ring-border">
                  <BadgeCheck className="size-3 text-emerald-600" /> Đã liên kết Google
                </span>
              )}
            </div>
            <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" /> Thành viên từ {formatDate(p.createdAt)}
            </div>
            <p className="hidden text-[11px] text-muted-foreground/80 lg:block">
              Ảnh đại diện hiện chữ cái đầu họ tên.
            </p>
          </div>
        </aside>
      </div>
    </AccountCard>
  );
}

function ProfileSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-2 h-4 w-64" />
      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_240px]">
        <div className="space-y-5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </div>
  );
}
