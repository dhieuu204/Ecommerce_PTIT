import { AlertCircle, MailCheck, MailWarning } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EMAIL_PATTERN, Field, pillInputClass, SubmitButton } from '@/components/form-bits';
import { API, api, ApiError } from '@/lib/api';
import { verifyEmail } from '@/lib/auth';
import { showApiError } from '@/lib/form';
import { LIMITS } from '@/lib/limits';
import {
  AuthCard,
  CodeInput,
  CodeTimers,
  DevMailHint,
  maskEmail,
  Notice,
  safeReturnTo,
  useCodeClock,
} from './auth-parts';

/** Xác minh email bằng mã 6 số (ACC-01). Đúng mã thì tài khoản được kích hoạt và đăng nhập luôn. */
export function VerifyEmailPage() {
  const [params, setParams] = useSearchParams();
  const email = (params.get('email') ?? '').trim().toLowerCase();
  if (!email)
    return <AskEmail onEmail={(e) => setParams({ ...Object.fromEntries(params), email: e })} />;
  return <VerifyForm key={email} email={email} returnTo={safeReturnTo(params.get('returnTo'))} />;
}

function VerifyForm({ email, returnTo }: { email: string; returnTo: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const mailFailed = (location.state as { mailFailed?: boolean } | null)?.mailFailed;
  const { sentAt, markSent } = useCodeClock('verify', email);
  const [code, setCode] = useState('');
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resent, setResent] = useState(false);

  const submit = async (value = code) => {
    if (!/^\d{6}$/.test(value)) {
      setError({ code: 'LOCAL', message: 'Vui lòng nhập đủ 6 chữ số.' });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await verifyEmail(email, value);
      toast.success('Xác minh thành công. Chào mừng bạn!');
      navigate(returnTo, { replace: true });
    } catch (e) {
      setSubmitting(false);
      if (e instanceof ApiError && (e.code === 'CODE_INVALID' || e.code === 'CODE_EXPIRED')) {
        setError({ code: e.code, message: e.message });
        setCode('');
      } else if (e instanceof ApiError && e.fields.code) {
        setError({ code: 'LOCAL', message: e.fields.code });
      } else {
        showApiError(e);
      }
    }
  };

  const resend = async () => {
    try {
      await api(`${API.user}/auth/resend-verification`, { method: 'POST', body: { email } });
      markSent();
      setResent(true);
      setError(null);
      setCode('');
      toast.success('Đã gửi mã mới. Bạn kiểm tra hộp thư (cả mục Thư rác) nhé.');
    } catch (e) {
      showApiError(e);
    }
  };

  return (
    <AuthCard
      title="Xác minh email"
      subtitle={
        <p className="text-muted-foreground">
          Nhập mã 6 số đã gửi tới{' '}
          <strong className="font-semibold text-navy">{maskEmail(email)}</strong>
        </p>
      }
      footer={
        <>
          Mã có hiệu lực {LIMITS.codeTtlMinutes} phút, nhập sai tối đa 5 lần.{' '}
          <Link to="/dang-ky" className="font-medium text-navy hover:underline">
            Đăng ký bằng email khác
          </Link>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        className="space-y-6"
      >
        {mailFailed && !resent && (
          <Notice tone="warning" icon={<MailWarning />}>
            Tài khoản đã được tạo nhưng chưa gửi được email. Bạn bấm "Gửi lại mã" sau ít phút.
          </Notice>
        )}
        {resent && !error && (
          <Notice tone="success" icon={<MailCheck />}>
            Mã mới đã được gửi. Mã cũ không còn dùng được.
          </Notice>
        )}
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (error?.code === 'LOCAL') setError(null);
          }}
          onComplete={(v) => void submit(v)}
          invalid={!!error}
          disabled={submitting}
          autoFocus
        />
        {error && (
          <Notice
            tone={error.code === 'CODE_EXPIRED' ? 'warning' : 'danger'}
            icon={<AlertCircle />}
          >
            {error.message}
          </Notice>
        )}
        <SubmitButton pill pending={submitting}>
          {submitting ? 'Đang xác minh…' : 'Xác minh'}
        </SubmitButton>
        <CodeTimers
          sentAt={sentAt}
          cooldownSeconds={LIMITS.resendCooldownSeconds}
          ttlMinutes={LIMITS.codeTtlMinutes}
          onResend={resend}
        />
        <DevMailHint />
      </form>
    </AuthCard>
  );
}

/** Mở trang mà không có email (ví dụ gõ thẳng đường dẫn): hỏi email trước */
function AskEmail({ onEmail }: { onEmail: (email: string) => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<{ email: string }>({ defaultValues: { email: '' } });
  return (
    <AuthCard
      title="Xác minh email"
      subtitle={<p className="text-muted-foreground">Nhập email bạn đã dùng để đăng ký.</p>}
    >
      <form
        noValidate
        className="space-y-5"
        onSubmit={handleSubmit((v) => onEmail(v.email.trim().toLowerCase()))}
      >
        <Field id="email" label="Email" error={errors.email?.message}>
          <input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="Nhập email đã đăng ký"
            className={pillInputClass}
            aria-invalid={!!errors.email}
            {...register('email', {
              required: 'Vui lòng nhập email.',
              pattern: { value: EMAIL_PATTERN, message: 'Email không hợp lệ.' },
            })}
          />
        </Field>
        <SubmitButton pill>Tiếp tục</SubmitButton>
      </form>
    </AuthCard>
  );
}
