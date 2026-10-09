import { AlertCircle, ArrowLeft, KeyRound, MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
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
import { API, api, ApiError } from '@/lib/api';
import { showApiError } from '@/lib/form';
import { LIMITS } from '@/lib/limits';
import { cn } from '@/lib/utils';
import {
  AuthCard,
  CodeInput,
  CodeTimers,
  DevMailHint,
  maskEmail,
  Notice,
  rememberCodeSent,
  useCodeClock,
} from './auth-parts';

/**
 * Quên mật khẩu (ACC-03). Bước 1: nhập email → POST /auth/forgot-password (luôn 202).
 * Bước 2: mã 6 số + mật khẩu mới → POST /auth/reset-password; xong thì đăng xuất mọi nơi, về trang đăng nhập.
 */
export function ForgotPasswordPage() {
  const [params] = useSearchParams();
  const [email, setEmail] = useState<string | null>(null);

  return (
    <AuthCard
      title="Quên mật khẩu"
      subtitle={<Steps step={email ? 2 : 1} />}
      footer={
        <>
          Nhớ ra rồi?{' '}
          <Link to="/dang-nhap" className="font-medium text-navy hover:underline">
            Quay lại đăng nhập
          </Link>
        </>
      }
    >
      {email ? (
        <ResetStep key={email} email={email} onBack={() => setEmail(null)} />
      ) : (
        <EmailStep defaultEmail={params.get('email') ?? ''} onSent={setEmail} />
      )}
    </AuthCard>
  );
}

function Steps({ step }: { step: 1 | 2 }) {
  const item = (n: 1 | 2, label: string) => (
    <span
      className={cn('flex items-center gap-2', step === n ? 'text-navy' : 'text-muted-foreground')}
    >
      <span
        className={cn(
          'flex size-6 items-center justify-center rounded-full text-xs font-semibold',
          step === n ? 'bg-navy text-white' : step > n ? 'bg-champagne text-navy' : 'bg-ivory-200',
        )}
      >
        {n}
      </span>
      <span className={cn('text-sm', step === n && 'font-medium')}>{label}</span>
    </span>
  );
  return (
    <div className="flex items-center justify-center gap-3">
      {item(1, 'Nhập email')}
      <span className="h-px w-8 bg-border" />
      {item(2, 'Mã và mật khẩu mới')}
    </div>
  );
}

function EmailStep({
  defaultEmail,
  onSent,
}: {
  defaultEmail: string;
  onSent: (email: string) => void;
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ defaultValues: { email: defaultEmail } });

  const onSubmit = handleSubmit(async (v) => {
    const email = v.email.trim().toLowerCase();
    try {
      await api(`${API.user}/auth/forgot-password`, { method: 'POST', body: { email } });
      rememberCodeSent('reset', email);
      onSent(email);
    } catch (e) {
      showApiError(e, setError);
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Nhập email của tài khoản. Chúng tôi gửi một mã 6 số để bạn đặt mật khẩu mới.
      </p>
      <Field id="email" label="Email" error={errors.email?.message}>
        <input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="Nhập email đã đăng ký"
          className={pillInputClass}
          aria-invalid={!!errors.email}
          {...register('email', {
            required: 'Vui lòng nhập email.',
            pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ.' },
          })}
        />
      </Field>
      <SubmitButton pill pending={isSubmitting}>
        {isSubmitting ? 'Đang gửi mã…' : 'Gửi mã'}
      </SubmitButton>
    </form>
  );
}

interface ResetForm {
  newPassword: string;
  confirm: string;
}

function ResetStep({ email, onBack }: { email: string; onBack: () => void }) {
  const navigate = useNavigate();
  const { sentAt, markSent } = useCodeClock('reset', email);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<{ code: string; message: string } | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ defaultValues: { newPassword: '', confirm: '' } });

  const onSubmit = handleSubmit(async (v) => {
    if (!/^\d{6}$/.test(code)) {
      setCodeError({ code: 'LOCAL', message: 'Vui lòng nhập đủ 6 chữ số trong email.' });
      return;
    }
    setCodeError(null);
    try {
      await api(`${API.user}/auth/reset-password`, {
        method: 'POST',
        body: { email, code, newPassword: v.newPassword },
      });
      toast.success('Đã đặt mật khẩu mới. Bạn đăng nhập lại bằng mật khẩu mới nhé.');
      navigate(`/dang-nhap?email=${encodeURIComponent(email)}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'CODE_INVALID' || e.code === 'CODE_EXPIRED')) {
        setCodeError({ code: e.code, message: e.message });
        setCode('');
      } else if (e instanceof ApiError && e.fields.code) {
        setCodeError({ code: 'LOCAL', message: e.fields.code });
      } else {
        showApiError(e, setError);
      }
    }
  });

  const resend = async () => {
    try {
      await api(`${API.user}/auth/forgot-password`, { method: 'POST', body: { email } });
      markSent();
      setCodeError(null);
      setCode('');
      toast.success('Đã gửi mã mới. Mã cũ không còn dùng được.');
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Notice tone="info" icon={<MailCheck />}>
        <p>
          Nếu <strong>{maskEmail(email)}</strong> có tài khoản, mã 6 số đã được gửi tới hộp thư.{' '}
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Đổi email
          </button>
        </p>
      </Notice>
      <div className="space-y-3">
        <div className="text-sm font-medium text-ink">Mã 6 số</div>
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (codeError?.code === 'LOCAL') setCodeError(null);
          }}
          invalid={!!codeError}
          disabled={isSubmitting}
          autoFocus
        />
        {codeError && (
          <Notice
            tone={codeError.code === 'CODE_EXPIRED' ? 'warning' : 'danger'}
            icon={<AlertCircle />}
          >
            {codeError.message}
          </Notice>
        )}
        <CodeTimers
          sentAt={sentAt}
          cooldownSeconds={LIMITS.resendCooldownSeconds}
          ttlMinutes={LIMITS.codeTtlMinutes}
          onResend={resend}
        />
      </div>
      <div className="h-px bg-border" />
      <Field id="newPassword" label="Mật khẩu mới" error={errors.newPassword?.message}>
        <PasswordInput
          id="newPassword"
          pill
          autoComplete="new-password"
          placeholder="Từ 8 ký tự"
          aria-invalid={!!errors.newPassword}
          {...register('newPassword', newPasswordRules)}
        />
        {!errors.newPassword && <PasswordStrength password={watch('newPassword')} />}
      </Field>
      <Field id="confirm" label="Nhập lại mật khẩu mới" error={errors.confirm?.message}>
        <PasswordInput
          id="confirm"
          pill
          autoComplete="new-password"
          placeholder="Nhập lại mật khẩu mới"
          aria-invalid={!!errors.confirm}
          {...register('confirm', {
            required: 'Vui lòng nhập lại mật khẩu.',
            validate: (x, all) => x === all.newPassword || 'Hai mật khẩu chưa khớp.',
          })}
        />
      </Field>
      <SubmitButton pill pending={isSubmitting}>
        {!isSubmitting && <KeyRound className="size-4" />}
        {isSubmitting ? 'Đang đặt lại…' : 'Đặt lại mật khẩu'}
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        Đặt lại xong, mọi thiết bị đang đăng nhập sẽ bị đăng xuất.
      </p>
      <DevMailHint />
    </form>
  );
}
