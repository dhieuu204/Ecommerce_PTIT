import { AlertCircle, Lock, MailWarning, ShieldAlert } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  EMAIL_PATTERN,
  Field,
  PasswordInput,
  pillInputClass,
  SubmitButton,
} from '@/components/form-bits';
import { GoogleButton } from '@/components/google-button';
import { Button } from '@/components/ui/button';
import { API, api, ApiError } from '@/lib/api';
import { login, useSession } from '@/lib/auth';
import { showApiError } from '@/lib/form';
import {
  AuthCard,
  mmss,
  Notice,
  OrDivider,
  rememberCodeSent,
  safeReturnTo,
  useCountdown,
} from './auth-parts';

/** Lỗi user-service gửi kèm khi đăng nhập Google không thành (GET /auth/google/callback → /dang-nhap?error=) */
const GOOGLE_ERRORS: Record<string, string> = {
  google_state:
    'Phiên đăng nhập Google đã hết hạn hoặc không hợp lệ. Bạn bấm "Đăng nhập bằng Google" lại nhé.',
  google_failed: 'Chưa đăng nhập được bằng Google lúc này. Bạn thử lại sau ít phút.',
  google_email_unverified:
    'Email của tài khoản Google này chưa được Google xác minh nên chưa dùng để đăng nhập được.',
  account_locked: 'Tài khoản đã bị khóa. Liên hệ hỗ trợ để mở khóa.',
};

type Problem =
  | { kind: 'error'; message: string }
  | { kind: 'locked'; message: string }
  | { kind: 'unverified'; message: string; email: string };

interface LoginForm {
  email: string;
  password: string;
}

/** Đăng nhập bằng email + mật khẩu hoặc Google (ACC-02). Màn hình E, docs/so-do/07. */
export function LoginPage() {
  const [params] = useSearchParams();
  const session = useSession();
  const navigate = useNavigate();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const googleError = params.get('error');

  const [problem, setProblem] = useState<Problem | null>(() =>
    googleError
      ? {
          kind: googleError === 'account_locked' ? 'locked' : 'error',
          message: GOOGLE_ERRORS[googleError] ?? 'Đăng nhập Google không thành công, bạn thử lại.',
        }
      : null,
  );
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const lockLeft = useCountdown(lockedUntil);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ defaultValues: { email: params.get('email') ?? '', password: '' } });

  // Đang đăng nhập rồi (ví dụ quay lại sau Google): đi thẳng tới trang cần tới
  if (session.status === 'user' && !isSubmitting) return <Navigate to={returnTo} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setProblem(null);
    try {
      await login(values.email.trim(), values.password);
      toast.success('Đăng nhập thành công.');
      navigate(returnTo, { replace: true });
    } catch (e) {
      if (!(e instanceof ApiError)) return void showApiError(e);
      switch (e.code) {
        case 'INVALID_CREDENTIALS':
          setProblem({ kind: 'error', message: e.message });
          break;
        case 'LOGIN_LOCKED': {
          const seconds = Number(e.details.retryAfterSeconds) || 15 * 60;
          setLockedUntil(Date.now() + seconds * 1000);
          setProblem(null);
          break;
        }
        case 'ACCOUNT_LOCKED':
          setProblem({ kind: 'locked', message: e.message });
          break;
        case 'EMAIL_NOT_VERIFIED':
          setProblem({
            kind: 'unverified',
            message: e.message,
            email: values.email.trim().toLowerCase(),
          });
          break;
        default:
          if (!showApiError(e, setError)) setProblem({ kind: 'error', message: e.message });
      }
    }
  });

  /** Chưa xác minh: gửi lại mã rồi sang trang nhập mã */
  const goVerify = async (email: string) => {
    setResending(true);
    try {
      await api(`${API.user}/auth/resend-verification`, { method: 'POST', body: { email } });
      rememberCodeSent('verify', email);
      const q = new URLSearchParams({ email });
      if (returnTo !== '/') q.set('returnTo', returnTo);
      navigate(`/xac-minh-email?${q}`);
    } catch (e) {
      showApiError(e);
    } finally {
      setResending(false);
    }
  };

  const registerLink = `/dang-ky${returnTo !== '/' ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`;

  return (
    <AuthCard
      title="Đăng nhập"
      subtitle={
        <>
          <p className="font-medium text-ink">Đăng nhập để mua sắm và theo dõi đơn dễ hơn</p>
          <p className="mt-1.5 text-muted-foreground">
            Bạn chưa có tài khoản?{' '}
            <Link to={registerLink} className="font-semibold text-champagne-600 hover:underline">
              Đăng ký
            </Link>
          </p>
        </>
      }
      footer="Email Google trùng với tài khoản đã có thì hai cách đăng nhập được gộp làm một."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {lockLeft > 0 && (
          <Notice tone="warning" icon={<Lock />}>
            <p>
              Bạn đã nhập sai mật khẩu quá nhiều lần. Đăng nhập tạm khóa, thử lại sau{' '}
              <strong className="tabular-nums">{mmss(lockLeft)}</strong>.
            </p>
            <p>
              Quên mật khẩu?{' '}
              <Link to="/quen-mat-khau" className="font-semibold underline">
                Đặt lại bằng mã qua email
              </Link>
            </p>
          </Notice>
        )}
        {problem?.kind === 'error' && (
          <Notice tone="danger" icon={<AlertCircle />}>
            {problem.message}
          </Notice>
        )}
        {problem?.kind === 'locked' && (
          <Notice tone="danger" icon={<ShieldAlert />}>
            {problem.message}
          </Notice>
        )}
        {problem?.kind === 'unverified' && (
          <Notice tone="warning" icon={<MailWarning />}>
            <p>{problem.message}</p>
            <Button
              type="button"
              size="sm"
              disabled={resending}
              onClick={() => goVerify(problem.email)}
              className="rounded-full bg-navy text-white hover:bg-navy-800"
            >
              {resending ? 'Đang gửi mã…' : 'Gửi lại mã và xác minh'}
            </Button>
          </Notice>
        )}

        <Field id="email" label="Email" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Nhập email của bạn"
            className={pillInputClass}
            aria-invalid={!!errors.email}
            {...register('email', {
              required: 'Vui lòng nhập email.',
              pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ.' },
            })}
          />
        </Field>
        <Field id="password" label="Mật khẩu" error={errors.password?.message}>
          <PasswordInput
            id="password"
            pill
            autoComplete="current-password"
            placeholder="Nhập mật khẩu của bạn"
            aria-invalid={!!errors.password}
            {...register('password', { required: 'Vui lòng nhập mật khẩu.' })}
          />
        </Field>
        <div className="-mt-1">
          <Link
            to="/quen-mat-khau"
            className="text-sm font-medium text-navy hover:text-champagne-600"
          >
            Quên mật khẩu?
          </Link>
        </div>
        <SubmitButton pill pending={isSubmitting} disabled={lockLeft > 0}>
          {lockLeft > 0 ? `Thử lại sau ${mmss(lockLeft)}` : 'Đăng nhập'}
        </SubmitButton>
      </form>
      <OrDivider />
      <div className="[&>button]:h-12 [&>button]:text-[15px]">
        <GoogleButton label="Đăng nhập bằng Google" returnTo={returnTo} />
      </div>
    </AuthCard>
  );
}
