import { Controller, useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  EMAIL_PATTERN,
  Field,
  newPasswordRules,
  PasswordInput,
  PasswordStrength,
  pillInputClass,
  SubmitButton,
} from '@/components/form-bits';
import { GoogleButton } from '@/components/google-button';
import { Checkbox } from '@/components/ui/checkbox';
import { API, api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { showApiError } from '@/lib/form';
import { AuthCard, OrDivider, rememberCodeSent, safeReturnTo } from './auth-parts';

interface RegisterForm {
  fullName: string;
  email: string;
  password: string;
  confirm: string;
  agree: boolean;
}

/** Đăng ký bằng email (ACC-01): họ tên, email, mật khẩu; xong sang trang nhập mã 6 số. */
export function RegisterPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const navigate = useNavigate();
  const returnTo = safeReturnTo(params.get('returnTo'));

  const {
    register,
    handleSubmit,
    setError,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    defaultValues: { fullName: '', email: '', password: '', confirm: '', agree: false },
  });
  const password = watch('password');

  if (session.status === 'user') return <Navigate to={returnTo} replace />;

  const goVerify = (email: string, mailFailed: boolean) => {
    const q = new URLSearchParams({ email });
    if (returnTo !== '/') q.set('returnTo', returnTo);
    navigate(`/xac-minh-email?${q}`, { state: { mailFailed } });
  };

  const onSubmit = handleSubmit(async (v) => {
    const email = v.email.trim().toLowerCase();
    try {
      await api(`${API.user}/auth/register`, {
        method: 'POST',
        body: { fullName: v.fullName.trim(), email, password: v.password },
      });
      rememberCodeSent('verify', email);
      toast.success('Đã tạo tài khoản. Mã xác minh đã gửi tới email của bạn.');
      goVerify(email, false);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_TAKEN') {
        setError('email', { type: 'server', message: e.message }, { shouldFocus: true });
      } else if (e instanceof ApiError && e.code === 'MAIL_SEND_FAILED') {
        // Tài khoản đã tạo, chỉ chưa gửi được thư: sang trang nhập mã để bấm gửi lại
        rememberCodeSent('verify', email);
        goVerify(email, true);
      } else {
        showApiError(e, setError);
      }
    }
  });

  return (
    <AuthCard
      title="Đăng ký"
      subtitle={
        <p className="text-muted-foreground">
          Đã có tài khoản?{' '}
          <Link
            to={`/dang-nhap${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="font-semibold text-champagne-600 hover:underline"
          >
            Đăng nhập
          </Link>
        </p>
      }
      footer="Số điện thoại, ngày sinh bạn điền sau ở mục Hồ sơ của tôi."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field id="fullName" label="Họ tên" error={errors.fullName?.message}>
          <input
            id="fullName"
            autoComplete="name"
            placeholder="Ví dụ: Nguyễn Văn An"
            className={pillInputClass}
            aria-invalid={!!errors.fullName}
            {...register('fullName', {
              validate: (x) => !!x.trim() || 'Vui lòng nhập họ tên.',
              maxLength: { value: 100, message: 'Họ tên tối đa 100 ký tự.' },
            })}
          />
        </Field>
        <Field id="email" label="Email" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Ví dụ: ban@gmail.com"
            className={pillInputClass}
            aria-invalid={!!errors.email}
            {...register('email', {
              required: 'Vui lòng nhập email.',
              pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ.' },
              maxLength: { value: 254, message: 'Email quá dài.' },
            })}
          />
        </Field>
        <Field id="password" label="Mật khẩu" error={errors.password?.message}>
          <PasswordInput
            id="password"
            pill
            autoComplete="new-password"
            placeholder="Từ 8 ký tự"
            aria-invalid={!!errors.password}
            {...register('password', newPasswordRules)}
          />
          {!errors.password && <PasswordStrength password={password} />}
        </Field>
        <Field id="confirm" label="Nhập lại mật khẩu" error={errors.confirm?.message}>
          <PasswordInput
            id="confirm"
            pill
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            aria-invalid={!!errors.confirm}
            {...register('confirm', {
              required: 'Vui lòng nhập lại mật khẩu.',
              validate: (x, all) => x === all.password || 'Hai mật khẩu chưa khớp.',
            })}
          />
        </Field>
        <Controller
          control={control}
          name="agree"
          rules={{ validate: (x) => x || 'Bạn cần đồng ý với điều khoản để đăng ký.' }}
          render={({ field, fieldState }) => (
            <div className="space-y-1.5">
              <label className="flex cursor-pointer items-start gap-3 text-sm text-ink">
                <Checkbox
                  ref={field.ref}
                  checked={field.value}
                  onCheckedChange={(c) => field.onChange(c === true)}
                  onBlur={field.onBlur}
                  aria-invalid={!!fieldState.error}
                  className="mt-0.5 size-5 rounded-[5px] data-[state=checked]:border-navy data-[state=checked]:bg-navy"
                />
                <span>
                  Tôi đồng ý với <span className="font-medium text-navy">Điều khoản sử dụng</span>{' '}
                  và <span className="font-medium text-navy">Chính sách bảo mật</span> của sàn.
                </span>
              </label>
              {fieldState.error && (
                <p className="text-xs text-destructive">{fieldState.error.message}</p>
              )}
            </div>
          )}
        />
        <SubmitButton pill pending={isSubmitting}>
          {isSubmitting ? 'Đang tạo tài khoản…' : 'Đăng ký'}
        </SubmitButton>
      </form>
      <OrDivider />
      <div className="[&>button]:h-12 [&>button]:text-[15px]">
        <GoogleButton label="Tiếp tục với Google" returnTo={returnTo} />
      </div>
    </AuthCard>
  );
}
