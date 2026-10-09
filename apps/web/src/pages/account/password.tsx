import { useQueryClient } from '@tanstack/react-query';
import { Info, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  Field,
  newPasswordRules,
  PasswordInput,
  PasswordStrength,
  SubmitButton,
} from '@/components/form-bits';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api, ApiError } from '@/lib/api';
import { showApiError } from '@/lib/form';
import { Notice } from '../auth/auth-parts';
import { AccountCard, PROFILE_KEY, useProfile } from './account-parts';

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirm: string;
}

/**
 * Đổi mật khẩu (ACC-03, màn hình F). Xong thì các thiết bị khác bị đăng xuất, thiết bị này giữ nguyên.
 * Tài khoản chỉ đăng nhập bằng Google (hasPassword = false): ẩn ô mật khẩu hiện tại, đây là lần đặt đầu tiên.
 */
export function PasswordPage() {
  const profile = useProfile();
  const queryClient = useQueryClient();
  const hasPassword = profile.data?.hasPassword ?? true;
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PasswordForm>({
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async (v) => {
    try {
      await api(`${API.user}/me/password`, {
        method: 'POST',
        body: {
          ...(hasPassword ? { currentPassword: v.currentPassword } : {}),
          newPassword: v.newPassword,
        },
      });
      reset();
      void queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      toast.success(
        hasPassword
          ? 'Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.'
          : 'Đã đặt mật khẩu. Từ giờ bạn đăng nhập được bằng email và mật khẩu.',
      );
    } catch (e) {
      if (e instanceof ApiError && e.code === 'WRONG_PASSWORD') {
        setError('currentPassword', { type: 'server', message: e.message }, { shouldFocus: true });
      } else {
        showApiError(e, setError);
      }
    }
  });

  const title = hasPassword ? 'Đổi mật khẩu' : 'Đặt mật khẩu';

  return (
    <AccountCard
      title={title}
      description="Để bảo mật tài khoản, bạn không chia sẻ mật khẩu cho người khác."
    >
      {profile.isPending ? (
        <div className="max-w-md space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,28rem)_1fr]">
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            {!hasPassword && (
              <Notice tone="info" icon={<Info />}>
                Tài khoản của bạn đăng nhập bằng Google và chưa có mật khẩu. Đặt mật khẩu để đăng
                nhập được cả bằng email.
              </Notice>
            )}
            {hasPassword && (
              <Field
                id="currentPassword"
                label="Mật khẩu hiện tại"
                error={errors.currentPassword?.message}
                aside={
                  <Link to="/quen-mat-khau" className="font-medium text-navy hover:underline">
                    Quên mật khẩu?
                  </Link>
                }
              >
                <PasswordInput
                  id="currentPassword"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu hiện tại"
                  aria-invalid={!!errors.currentPassword}
                  {...register('currentPassword', {
                    required: 'Vui lòng nhập mật khẩu hiện tại.',
                  })}
                />
              </Field>
            )}
            <Field id="newPassword" label="Mật khẩu mới" error={errors.newPassword?.message}>
              <PasswordInput
                id="newPassword"
                autoComplete="new-password"
                placeholder="Từ 8 ký tự"
                aria-invalid={!!errors.newPassword}
                {...register('newPassword', {
                  ...newPasswordRules,
                  validate: (x, all) =>
                    !hasPassword ||
                    x !== all.currentPassword ||
                    'Mật khẩu mới cần khác mật khẩu hiện tại.',
                })}
              />
              {!errors.newPassword && <PasswordStrength password={watch('newPassword')} />}
            </Field>
            <Field id="confirm" label="Nhập lại mật khẩu mới" error={errors.confirm?.message}>
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu mới"
                aria-invalid={!!errors.confirm}
                {...register('confirm', {
                  required: 'Vui lòng nhập lại mật khẩu mới.',
                  validate: (x, all) => x === all.newPassword || 'Hai mật khẩu chưa khớp.',
                })}
              />
            </Field>
            <SubmitButton pending={isSubmitting} className="w-full sm:w-auto">
              {title}
            </SubmitButton>
          </form>
          <aside className="hidden self-start rounded-2xl border border-champagne/30 bg-champagne-50/60 p-5 lg:block">
            <ShieldCheck className="size-8 text-champagne-600" />
            <h2 className="mt-3 font-semibold text-navy">Gợi ý mật khẩu an toàn</h2>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm text-ink/80">
              <li>Từ 8 đến 72 ký tự; càng dài càng khó đoán.</li>
              <li>Trộn chữ hoa, chữ thường, chữ số và ký hiệu.</li>
              <li>Không dùng lại mật khẩu của trang khác.</li>
              <li>Đổi xong, các thiết bị khác sẽ phải đăng nhập lại.</li>
            </ul>
          </aside>
        </div>
      )}
    </AccountCard>
  );
}
