import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ImagePlus, Info, Loader2, RefreshCw, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, useController, useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Field, inputClass, PHONE_PATTERN, SubmitButton } from '@/components/form-bits';
import { LocationFields } from '@/components/location-fields';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { MY_SHOP_KEY, useMyShop } from '@/hooks/use-my-shop';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { BANKS } from '@/lib/banks';
import { showApiError, newIdempotencyKey } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { LIMITS } from '@/lib/limits';
import type { MyShop, ShopView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Notice } from '../auth/auth-parts';
import { AccountCard, SectionTitle } from './account-parts';
import { toCardName } from './shop-parts';

interface ApplyForm {
  name: string;
  description: string;
  logoUrl: string;
  phone: string;
  pickupAddress: {
    provinceId: number | undefined;
    districtId: number | undefined;
    wardCode: string | undefined;
    street: string;
  };
  bankAccount: { bankName: string; accountNumber: string; accountName: string };
  agree: boolean;
}

const DESCRIPTION_MAX = 3000;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Điền sẵn từ hồ sơ đã nộp (bị từ chối hoặc đang chờ) để sửa và nộp lại */
const fromShop = (shop: ShopView | null): ApplyForm => ({
  name: shop?.name ?? '',
  description: shop?.description ?? '',
  logoUrl: shop?.logoUrl ?? '',
  phone: shop?.phone ?? '',
  pickupAddress: {
    provinceId: shop?.pickupAddress?.provinceId,
    districtId: shop?.pickupAddress?.districtId,
    wardCode: shop?.pickupAddress?.wardCode,
    street: shop?.pickupAddress?.street ?? '',
  },
  bankAccount: {
    bankName: shop?.bankAccount?.bankName ?? '',
    accountNumber: shop?.bankAccount?.accountNumber ?? '',
    accountName: shop?.bankAccount?.accountName ?? '',
  },
  agree: false,
});

const SECTIONS = [
  { id: 'thong-tin-shop', label: 'Thông tin shop', short: 'Shop' },
  { id: 'dia-chi-lay-hang', label: 'Địa chỉ lấy hàng', short: 'Lấy hàng' },
  { id: 'tai-khoan-nhan-tien', label: 'Tài khoản nhận tiền', short: 'Ngân hàng' },
];

/** Đăng ký mở shop (SHP-01, màn hình H): một trang dài 3 phần đánh số. */
export function ShopApplyPage() {
  const shop = useMyShop();
  if (shop.isPending) {
    return (
      <AccountCard title="Đăng ký mở shop">
        <div className="space-y-5">
          <Skeleton className="h-10 w-full" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </AccountCard>
    );
  }
  if (shop.data?.status === 'ACTIVE' || shop.data?.status === 'SUSPENDED')
    return <Navigate to="/tai-khoan/shop" replace />;
  return <ApplyFormView myShop={shop.data ?? null} />;
}

function ApplyFormView({ myShop }: { myShop: MyShop | null }) {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const status = myShop?.status ?? 'NONE';
  const app = myShop?.application ?? null;
  const resubmit = status === 'REJECTED' || status === 'PENDING';

  const {
    register,
    handleSubmit,
    setError,
    clearErrors,
    control,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ApplyForm>({ defaultValues: fromShop(resubmit ? (myShop?.shop ?? null) : null) });

  const province = useController({
    control,
    name: 'pickupAddress.provinceId',
    rules: { required: 'Vui lòng chọn tỉnh/thành.' },
  });
  const district = useController({
    control,
    name: 'pickupAddress.districtId',
    rules: { required: 'Vui lòng chọn quận/huyện.' },
  });
  const ward = useController({
    control,
    name: 'pickupAddress.wardCode',
    rules: { required: 'Vui lòng chọn phường/xã.' },
  });

  // Mã chống gửi lặp: giữ nguyên khi bấm gửi lại cùng nội dung (mạng chập chờn), đổi khi nội dung đổi
  const attempt = useRef<{ key: string; payload: string } | null>(null);

  const onSubmit = handleSubmit(async (v) => {
    const body = {
      name: v.name.trim(),
      description: v.description.trim(),
      logoUrl: v.logoUrl,
      phone: v.phone.trim(),
      pickupAddress: {
        provinceId: v.pickupAddress.provinceId,
        districtId: v.pickupAddress.districtId,
        wardCode: v.pickupAddress.wardCode,
        street: v.pickupAddress.street.trim(),
      },
      bankAccount: {
        bankName: v.bankAccount.bankName,
        accountNumber: v.bankAccount.accountNumber.trim(),
        accountName: toCardName(v.bankAccount.accountName.trim()),
      },
    };
    const payload = JSON.stringify(body);
    if (attempt.current?.payload !== payload) {
      attempt.current = { key: newIdempotencyKey(), payload };
    }
    try {
      const result = await api<MyShop>(`${API.market}/shops/me/applications`, {
        method: 'POST',
        body,
        idempotencyKey: attempt.current.key,
      });
      queryClient.setQueryData([...MY_SHOP_KEY, user?.id], result);
      toast.success('Đã nộp hồ sơ mở shop. Admin sẽ duyệt sớm.');
      navigate('/tai-khoan/shop', { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SHOP_NAME_TAKEN') {
        setError('name', { type: 'server', message: e.message }, { shouldFocus: true });
      } else if (e instanceof ApiError && e.code === 'SHOP_ALREADY_ACTIVE') {
        toast.info(e.message);
        await queryClient.invalidateQueries({ queryKey: MY_SHOP_KEY });
        navigate('/tai-khoan/shop', { replace: true });
      } else {
        showApiError(e, setError);
      }
    }
  });

  const description = watch('description');
  const active = useActiveSection();

  return (
    <AccountCard
      title={resubmit ? 'Sửa hồ sơ mở shop' : 'Đăng ký mở shop'}
      description="Điền đủ 3 phần rồi nộp. Admin duyệt xong là bạn bán được hàng."
    >
      <nav className="sticky top-16 z-10 -mx-5 mb-6 border-b bg-card/95 px-5 py-3 backdrop-blur md:top-20 md:-mx-7 md:px-7">
        <ol className="grid grid-cols-3 gap-2">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={cn(
                  'flex h-10 items-center justify-center gap-2 rounded-lg border px-2 text-center text-xs transition sm:text-sm',
                  active === s.id
                    ? 'border-champagne bg-champagne-50 font-medium text-navy'
                    : 'border-transparent bg-ivory text-muted-foreground hover:text-navy',
                )}
              >
                <span className="font-semibold">{i + 1}</span>
                <span className="truncate sm:hidden">{s.short}</span>
                <span className="hidden truncate sm:inline">{s.label}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <form onSubmit={onSubmit} noValidate className="space-y-8">
        {status === 'REJECTED' && app?.rejectReason && (
          <Notice tone="danger" icon={<AlertCircle />}>
            <p>
              <span className="font-medium">Hồ sơ phiên bản {app.version} bị từ chối</span>
              {app.decidedAt && ` ngày ${formatDate(app.decidedAt)}`}. Lý do: {app.rejectReason}
            </p>
            <p className="text-red-700/80">Thông tin cũ đã được điền sẵn, bạn sửa rồi nộp lại.</p>
          </Notice>
        )}
        {status === 'PENDING' && (
          <Notice tone="info" icon={<Info />}>
            Hồ sơ phiên bản {app?.version} đang chờ duyệt. Nộp bản này sẽ thay bản đang chờ.
          </Notice>
        )}

        {/* 1. Thông tin shop */}
        <section className="space-y-5">
          <SectionTitle id={SECTIONS[0]!.id} index={1} title="Thông tin shop" />
          <div className="grid gap-5 md:grid-cols-[1fr_auto]">
            <div className="order-2 space-y-5 md:order-1">
              <Field
                id="name"
                label="Tên shop"
                error={errors.name?.message}
                hint="Tên là duy nhất trên sàn. Đổi tên sau này phải được duyệt lại."
              >
                <input
                  id="name"
                  placeholder="Ví dụ: Shop An Phát"
                  className={inputClass}
                  aria-invalid={!!errors.name}
                  {...register('name', {
                    validate: (x) => {
                      const n = x.trim().length;
                      if (n === 0) return 'Vui lòng nhập tên shop.';
                      return (n >= 3 && n <= 80) || 'Tên shop từ 3 đến 80 ký tự.';
                    },
                  })}
                />
              </Field>
              <Field id="phone" label="Số điện thoại shop" error={errors.phone?.message}>
                <input
                  id="phone"
                  type="tel"
                  inputMode="numeric"
                  placeholder="0912345678"
                  className={cn(inputClass, 'sm:max-w-xs')}
                  aria-invalid={!!errors.phone}
                  {...register('phone', {
                    required: 'Vui lòng nhập số điện thoại shop.',
                    pattern: {
                      value: PHONE_PATTERN,
                      message: 'Số điện thoại gồm số 0 và 9 chữ số.',
                    },
                  })}
                />
              </Field>
            </div>
            <Controller
              control={control}
              name="logoUrl"
              rules={{ required: 'Vui lòng tải logo shop.' }}
              render={({ field, fieldState }) => (
                <LogoUpload
                  focusRef={field.ref}
                  value={field.value}
                  error={fieldState.error?.message}
                  onUploaded={(url) => {
                    field.onChange(url);
                    clearErrors('logoUrl');
                  }}
                  onError={(message) => setError('logoUrl', { type: 'upload', message })}
                />
              )}
            />
          </div>
          <Field
            id="description"
            label="Mô tả shop"
            error={errors.description?.message}
            aside={
              <span className={cn(description.length > DESCRIPTION_MAX && 'text-destructive')}>
                {description.length.toLocaleString('vi-VN')}/
                {DESCRIPTION_MAX.toLocaleString('vi-VN')}
              </span>
            }
          >
            <textarea
              id="description"
              rows={4}
              placeholder="Ví dụ: Chuyên điện thoại và phụ kiện chính hãng, bảo hành 12 tháng."
              className={cn(inputClass, 'h-auto min-h-28 resize-y py-2.5 leading-relaxed')}
              aria-invalid={!!errors.description}
              {...register('description', {
                validate: (x) => !!x.trim() || 'Vui lòng nhập mô tả shop.',
                maxLength: { value: DESCRIPTION_MAX, message: 'Mô tả tối đa 3000 ký tự.' },
              })}
            />
          </Field>
        </section>

        <div className="h-px bg-border" />

        {/* 2. Địa chỉ lấy hàng */}
        <section className="space-y-5">
          <SectionTitle
            id={SECTIONS[1]!.id}
            index={2}
            title="Địa chỉ lấy hàng"
            description="Shipper GHN tới đây lấy hàng."
          />
          <LocationFields
            value={{
              provinceId: province.field.value,
              districtId: district.field.value,
              wardCode: ward.field.value,
            }}
            onChange={(loc) => {
              province.field.onChange(loc.provinceId);
              district.field.onChange(loc.districtId);
              ward.field.onChange(loc.wardCode);
            }}
            errors={{
              provinceId: province.fieldState.error?.message,
              districtId: district.fieldState.error?.message,
              wardCode: ward.fieldState.error?.message,
            }}
          />
          <Field
            id="street"
            label="Số nhà, tên đường"
            error={errors.pickupAddress?.street?.message}
          >
            <input
              id="street"
              placeholder="Ví dụ: Số 8 Trần Thái Tông"
              className={inputClass}
              aria-invalid={!!errors.pickupAddress?.street}
              {...register('pickupAddress.street', {
                validate: (x) => !!x.trim() || 'Vui lòng nhập số nhà, tên đường.',
                maxLength: { value: 200, message: 'Địa chỉ tối đa 200 ký tự.' },
              })}
            />
          </Field>
        </section>

        <div className="h-px bg-border" />

        {/* 3. Tài khoản ngân hàng */}
        <section className="space-y-5">
          <SectionTitle
            id={SECTIONS[2]!.id}
            index={3}
            title="Tài khoản ngân hàng nhận tiền bán hàng"
            description="Đổi tài khoản sau này phải được duyệt lại."
          />
          <div className="grid gap-5 sm:grid-cols-3">
            <Field id="bankName" label="Ngân hàng" error={errors.bankAccount?.bankName?.message}>
              <select
                id="bankName"
                className={inputClass}
                aria-invalid={!!errors.bankAccount?.bankName}
                {...register('bankAccount.bankName', { required: 'Vui lòng chọn ngân hàng.' })}
              >
                <option value="">Chọn ngân hàng</option>
                {BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="accountNumber"
              label="Số tài khoản"
              error={errors.bankAccount?.accountNumber?.message}
            >
              <DigitsInput
                id="accountNumber"
                placeholder="6 đến 20 chữ số"
                aria-invalid={!!errors.bankAccount?.accountNumber}
                {...register('bankAccount.accountNumber', {
                  required: 'Vui lòng nhập số tài khoản.',
                  pattern: { value: /^\d{6,20}$/, message: 'Số tài khoản gồm 6 đến 20 chữ số.' },
                })}
              />
            </Field>
            <Field
              id="accountName"
              label="Tên chủ tài khoản"
              error={errors.bankAccount?.accountName?.message}
              hint="Viết hoa không dấu, như trên thẻ."
            >
              <CardNameInput
                id="accountName"
                placeholder="NGUYEN VAN AN"
                aria-invalid={!!errors.bankAccount?.accountName}
                {...register('bankAccount.accountName', {
                  validate: (x) => !!x.trim() || 'Vui lòng nhập tên chủ tài khoản.',
                  maxLength: { value: 100, message: 'Tên chủ tài khoản tối đa 100 ký tự.' },
                })}
              />
            </Field>
          </div>
        </section>

        <div className="space-y-5 rounded-2xl border border-champagne/40 bg-champagne-50/50 p-4 md:p-5">
          <Controller
            control={control}
            name="agree"
            rules={{ validate: (x) => x || 'Bạn cần đồng ý quy định người bán để nộp hồ sơ.' }}
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
                    Tôi đồng ý <span className="font-medium text-navy">Quy định người bán</span> và
                    phí sàn 5% trên mỗi đơn giao thành công.
                  </span>
                </label>
                {fieldState.error && (
                  <p className="text-xs text-destructive">{fieldState.error.message}</p>
                )}
              </div>
            )}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SubmitButton pending={isSubmitting} className="h-11 w-full px-8 sm:w-auto">
              {!isSubmitting && <Send className="size-4" />}
              {isSubmitting ? 'Đang nộp hồ sơ…' : 'Nộp hồ sơ'}
            </SubmitButton>
            <p className="text-xs text-muted-foreground">
              Nộp xong bạn theo dõi kết quả ở mục Shop của tôi.
            </p>
          </div>
        </div>
      </form>
    </AccountCard>
  );
}

/** Phần đang xem (để tô ô số 1-2-3 ở đầu form) */
function useActiveSection() {
  const [active, setActive] = useState(SECTIONS[0]!.id);
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => !!el,
    );
    const onScroll = () => {
      // Phần cuối cùng có tiêu đề đã lên tới nửa trên màn hình
      let current = SECTIONS[0]!.id;
      for (const el of els) {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.45) current = el.id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return active;
}

/** Ô chỉ nhận chữ số (dán "0011 0044 55667" thành "0011004455667") */
function DigitsInput({ onChange, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      inputMode="numeric"
      autoComplete="off"
      className={inputClass}
      maxLength={20}
      {...props}
      onChange={(e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
        onChange?.(e);
      }}
    />
  );
}

/** Ô tên chủ tài khoản: tự viết hoa, bỏ dấu, giữ vị trí con trỏ */
function CardNameInput({ onChange, className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      autoComplete="off"
      className={cn(inputClass, 'uppercase', className)}
      {...props}
      onChange={(e) => {
        const el = e.target;
        const pos = el.selectionStart;
        el.value = toCardName(el.value);
        if (pos !== null) el.setSelectionRange(pos, pos);
        onChange?.(e);
      }}
    />
  );
}

/** Tải logo: bấm ô vuông chọn ảnh, tải lên ngay (POST /uploads/shop-logo) rồi hiện ảnh xem trước */
function LogoUpload({
  focusRef,
  value,
  error,
  onUploaded,
  onError,
}: {
  focusRef: React.Ref<HTMLButtonElement>;
  value: string;
  error?: string;
  onUploaded: (url: string) => void;
  onError: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const upload = async (file: File) => {
    if (!IMAGE_TYPES.includes(file.type)) return onError('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (file.size > LIMITS.shopLogoMaxMb * 1024 * 1024) {
      return onError(`Ảnh tối đa ${LIMITS.shopLogoMaxMb} MB.`);
    }
    const form = new FormData();
    form.append('file', file);
    setUploading(true);
    try {
      const { url } = await api<{ url: string }>(`${API.market}/uploads/shop-logo`, {
        method: 'POST',
        formData: form,
      });
      onUploaded(url);
    } catch (e) {
      onError(e instanceof ApiError ? e.message : 'Chưa tải được ảnh, bạn thử lại.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="order-1 flex items-center gap-4 md:order-2 md:w-40 md:flex-col md:items-center md:text-center">
      <button
        type="button"
        id="logoUrl"
        ref={focusRef}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-invalid={!!error}
        className={cn(
          'group relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-ivory transition outline-none focus-visible:ring-[3px] focus-visible:ring-champagne/40 md:size-36',
          error
            ? 'border-destructive/60 bg-red-50/40'
            : 'border-champagne/60 hover:border-champagne',
          value && !error && 'border-solid border-border bg-white',
        )}
      >
        {value ? (
          <img src={value} alt="Logo shop" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5 px-2 text-xs text-muted-foreground">
            <ImagePlus className="size-7 text-champagne-600" />
            Bấm để tải logo
          </span>
        )}
        {uploading && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="size-6 animate-spin text-navy" />
          </span>
        )}
        {value && !uploading && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-navy/80 py-1.5 text-xs text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
            <RefreshCw className="size-3" /> Đổi logo
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-1 text-xs">
        <div className="font-medium text-ink">Logo shop</div>
        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground">
            JPG, PNG hoặc WebP, tối đa {LIMITS.shopLogoMaxMb} MB. Nên dùng ảnh vuông.
          </p>
        )}
        {value && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-medium text-navy hover:underline md:hidden"
          >
            Đổi logo
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
