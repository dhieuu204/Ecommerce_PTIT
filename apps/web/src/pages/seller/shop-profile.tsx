import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Clock3,
  Landmark,
  Loader2,
  MapPin,
  Phone,
  ShieldAlert,
  Store,
  XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import { FormField, inputClass, SectionCard } from '@/components/console/form-field';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { PageHeader } from '@/components/layout/page-header';
import { LocationFields } from '@/components/location-fields';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { MY_SHOP_KEY, useMyShop } from '@/hooks/use-my-shop';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { formatDate, formatDateTime, maskAccount } from '@/lib/format';
import { showApiError } from '@/lib/form';
import type { ApplicationView, BankAccount, MyShop, ShopView } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ChangeRequestDialog, type ChangeField } from './change-request-dialog';

/** Logo: JPG/PNG/WebP, tối đa 2 MB (máy chủ kiểm lại theo cấu hình của nó) */
const LOGO_MAX_MB = 2;
const LOGO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
/** Báo "đã duyệt" của yêu cầu đổi chỉ hiện trong 7 ngày sau khi duyệt */
const APPROVED_NOTICE_DAYS = 7;

interface EditForm {
  description: string;
  phone: string;
  logoUrl: string;
  pickupAddress: { provinceId?: number; districtId?: number; wardCode?: string; street: string };
}

function defaults(shop: ShopView): EditForm {
  return {
    description: shop.description ?? '',
    phone: shop.phone ?? '',
    logoUrl: shop.logoUrl ?? '',
    pickupAddress: {
      provinceId: shop.pickupAddress?.provinceId,
      districtId: shop.pickupAddress?.districtId,
      wardCode: shop.pickupAddress?.wardCode,
      street: shop.pickupAddress?.street ?? '',
    },
  };
}

export const bankText = (b: BankAccount) =>
  `${b.bankName} · ${maskAccount(b.accountNumber)} · ${b.accountName}`;

/**
 * Kênh người bán › Hồ sơ shop (SHP-03, docs/so-do/13 mục I).
 * - Mô tả, logo, SĐT, địa chỉ lấy hàng: PATCH /shops/me, dùng ngay.
 * - Tên shop, tài khoản ngân hàng: POST /shops/me/change-requests, admin duyệt lại.
 */
export function ShopProfilePage() {
  const shop = useMyShop();
  const location = useLocation();

  // Mục menu "Địa chỉ lấy hàng" nhảy tới ô địa chỉ của trang này
  useEffect(() => {
    if (!shop.data || !location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, shop.data]);

  if (shop.isPending) return <ProfileSkeleton />;
  if (shop.isError || !shop.data?.shop) {
    return (
      <LoadError
        message={shop.error?.message ?? 'Không tìm thấy shop.'}
        onRetry={() => void shop.refetch()}
      />
    );
  }
  const data = shop.data;
  const current = data.shop!;
  // Shop bị đình chỉ: API sửa hồ sơ trả 409 SHOP_NOT_ACTIVE nên khóa các nút sửa
  const suspended = data.status === 'SUSPENDED';

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        crumbs={[{ label: 'Shop' }, { label: 'Hồ sơ shop' }]}
        title="Hồ sơ shop"
        description="Thông tin người mua nhìn thấy và dùng khi giao hàng, nhận tiền."
      />
      <ShopHero shop={current} />
      <ChangeRequestBanner data={data} />
      <EditNowCard shop={current} suspended={suspended} />
      <ReviewCard data={data} suspended={suspended} />
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-36 rounded-2xl" />
      <Skeleton className="h-96 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
}

/** Dải đầu trang: logo, tên shop, trạng thái */
function ShopHero({ shop }: { shop: ShopView }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-navy text-white shadow-lg shadow-navy/10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-champagne/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-gradient-to-l from-navy-800 to-transparent md:block"
      />
      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center md:p-7">
        <ShopLogo url={shop.logoUrl} className="size-20 ring-4 ring-champagne/40" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-semibold md:text-2xl">{shop.name}</h2>
            {shop.status === 'SUSPENDED' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-300/30">
                <ShieldAlert className="size-3.5" /> Bị đình chỉ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2.5 py-0.5 text-xs font-medium text-emerald-200 ring-1 ring-emerald-300/30">
                <BadgeCheck className="size-3.5" /> Đang hoạt động
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-col gap-1.5 text-sm text-white/75 sm:flex-row sm:flex-wrap sm:gap-x-5">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4 text-champagne" /> Mở shop từ{' '}
              {formatDate(shop.createdAt)}
            </span>
            {shop.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="size-4 text-champagne" /> {shop.phone}
              </span>
            )}
            {shop.pickupAddress && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <MapPin className="size-4 shrink-0 text-champagne" />
                <span className="truncate">{shop.pickupAddress.fullText}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Giá trị cũ → mới của một yêu cầu đổi */
function ChangeLines({
  shop,
  change,
  rejected,
}: {
  shop: ShopView;
  change: ApplicationView['change'];
  /** Bị từ chối: thông tin cũ vẫn đang dùng nên không gạch, chỉ hiện giá trị đã yêu cầu */
  rejected?: boolean;
}) {
  if (!change) return null;
  return (
    <dl className="mt-3 grid gap-2 text-sm">
      {change.fields.includes('name') && (
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
          <dt className="text-xs font-medium tracking-wide uppercase opacity-70">Tên shop</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {!rejected && (
              <>
                <span className="line-through decoration-1 opacity-70">{shop.name}</span>
                <ArrowRight className="size-3.5 shrink-0" />
              </>
            )}
            <span className="font-semibold">{change.name}</span>
          </dd>
        </div>
      )}
      {change.fields.includes('bankAccount') && change.bankAccount && (
        <div className="grid gap-1 sm:grid-cols-[140px_1fr] sm:items-center">
          <dt className="text-xs font-medium tracking-wide uppercase opacity-70">Ngân hàng</dt>
          <dd className="flex flex-wrap items-center gap-2">
            {shop.bankAccount && !rejected && (
              <>
                <span className="line-through decoration-1 opacity-70">
                  {bankText(shop.bankAccount)}
                </span>
                <ArrowRight className="size-3.5 shrink-0" />
              </>
            )}
            <span className="font-semibold">{bankText(change.bankAccount)}</span>
          </dd>
        </div>
      )}
    </dl>
  );
}

/** Banner yêu cầu đổi đang chờ / bị từ chối / vừa được duyệt */
function ChangeRequestBanner({ data }: { data: MyShop }) {
  const req = data.changeRequest;
  const shop = data.shop!;
  if (!req) return null;

  if (req.status === 'PENDING') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-900 md:p-5">
        <div className="flex gap-3">
          <Clock3 className="mt-0.5 size-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Yêu cầu đổi thông tin đang chờ duyệt</div>
            <p className="mt-0.5 text-sm text-amber-800/90">
              Phiên bản {req.version} · gửi lúc {formatDateTime(req.submittedAt)}. Shop vẫn bán bằng
              thông tin cũ cho tới khi được duyệt.
            </p>
            <ChangeLines shop={shop} change={req.change} />
          </div>
        </div>
      </div>
    );
  }
  if (req.status === 'REJECTED') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-900 md:p-5">
        <div className="flex gap-3">
          <XCircle className="mt-0.5 size-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <div className="font-semibold">Yêu cầu đổi thông tin chưa được duyệt</div>
            <p className="mt-1 text-sm">
              <span className="font-medium">Lý do:</span> {req.rejectReason}
            </p>
            <p className="mt-0.5 text-xs text-red-800/80">
              Phiên bản {req.version} · quyết định lúc {formatDateTime(req.decidedAt)}. Bạn có thể
              sửa và gửi yêu cầu mới ở mục "Thông tin cần duyệt lại".
            </p>
            <div className="mt-3 text-xs font-medium">Bạn đã yêu cầu đổi thành:</div>
            <ChangeLines shop={shop} change={req.change} rejected />
          </div>
        </div>
      </div>
    );
  }
  const recent =
    req.status === 'APPROVED' &&
    req.decidedAt &&
    Date.now() - new Date(req.decidedAt).getTime() < APPROVED_NOTICE_DAYS * 86_400_000;
  if (!recent) return null;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
      <BadgeCheck className="size-5 shrink-0 text-emerald-600" />
      Yêu cầu đổi thông tin (phiên bản {req.version}) đã được duyệt lúc{' '}
      {formatDateTime(req.decidedAt)}.
    </div>
  );
}

/** Thông tin sửa ngay: mô tả, logo, SĐT, địa chỉ lấy hàng */
function EditNowCard({ shop, suspended }: { shop: ShopView; suspended: boolean }) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const form = useForm<EditForm>({ defaultValues: defaults(shop) });
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = form;

  useEffect(() => reset(defaults(shop)), [shop, reset]);

  const values = watch();
  const base = defaults(shop);
  const pickupChanged =
    values.pickupAddress.provinceId !== base.pickupAddress.provinceId ||
    values.pickupAddress.districtId !== base.pickupAddress.districtId ||
    values.pickupAddress.wardCode !== base.pickupAddress.wardCode ||
    values.pickupAddress.street.trim() !== base.pickupAddress.street;
  const changed = {
    description: values.description.trim() !== base.description,
    phone: values.phone.trim() !== base.phone,
    logoUrl: values.logoUrl !== base.logoUrl,
    pickupAddress: pickupChanged,
  };
  const dirty = Object.values(changed).some(Boolean);

  async function onPickLogo(file: File | undefined) {
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      toast.error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
      return;
    }
    if (file.size > LOGO_MAX_MB * 1024 * 1024) {
      toast.error(`Ảnh tối đa ${LOGO_MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api<{ url: string }>(`${API.market}/uploads/shop-logo`, {
        method: 'POST',
        formData,
      });
      setValue('logoUrl', res.url, { shouldDirty: true });
      clearErrors('logoUrl');
      toast.success('Đã tải logo. Bấm "Lưu thay đổi" để dùng logo mới.');
    } catch (e) {
      showApiError(e);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onSubmit(v: EditForm) {
    const p = v.pickupAddress;
    if (changed.pickupAddress) {
      let missing = false;
      if (!p.provinceId) {
        setError('pickupAddress.provinceId', { message: 'Vui lòng chọn tỉnh/thành.' });
        missing = true;
      }
      if (!p.districtId) {
        setError('pickupAddress.districtId', { message: 'Vui lòng chọn quận/huyện.' });
        missing = true;
      }
      if (!p.wardCode) {
        setError('pickupAddress.wardCode', { message: 'Vui lòng chọn phường/xã.' });
        missing = true;
      }
      if (missing) return;
    }
    const body: Record<string, unknown> = {};
    if (changed.description) body.description = v.description.trim();
    if (changed.phone) body.phone = v.phone.trim();
    if (changed.logoUrl) body.logoUrl = v.logoUrl;
    if (changed.pickupAddress) body.pickupAddress = { ...p, street: p.street.trim() };
    try {
      const result = await api<MyShop>(`${API.market}/shops/me`, { method: 'PATCH', body });
      queryClient.setQueryData([...MY_SHOP_KEY, user?.id], result);
      toast.success('Đã lưu thông tin shop.');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'SHOP_NOT_ACTIVE') {
        toast.error(e.message);
        void queryClient.invalidateQueries({ queryKey: MY_SHOP_KEY });
        return;
      }
      showApiError(e, setError);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <SectionCard
        title="Thông tin sửa ngay"
        description="Lưu là áp dụng luôn, không cần chờ duyệt."
      >
        <div className="grid gap-6 md:grid-cols-[160px_1fr]">
          <div className="flex flex-col items-center gap-3 md:items-start">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="group relative rounded-2xl outline-none focus-visible:ring-[3px] focus-visible:ring-champagne/40"
              aria-label="Đổi logo"
            >
              <ShopLogo
                url={values.logoUrl || null}
                className="size-32 border border-champagne/40 shadow-sm md:size-36"
              />
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-2xl bg-navy/60 text-xs font-medium text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                <Camera className="size-5" /> Đổi logo
              </span>
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/70">
                  <Loader2 className="size-6 animate-spin text-navy" />
                </span>
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={LOGO_TYPES.join(',')}
              className="hidden"
              onChange={(e) => void onPickLogo(e.target.files?.[0])}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full border-champagne/60"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Camera /> Đổi logo
            </Button>
            <p className="text-center text-xs text-muted-foreground md:text-left">
              JPG, PNG hoặc WebP, tối đa {LOGO_MAX_MB} MB.
              {changed.logoUrl && (
                <span className="mt-1 block font-medium text-amber-700">Logo mới chưa lưu</span>
              )}
            </p>
            {errors.logoUrl && <p className="text-xs text-destructive">{errors.logoUrl.message}</p>}
          </div>

          <div className="min-w-0 space-y-5">
            <FormField
              label="Mô tả shop"
              htmlFor="description"
              required
              error={errors.description?.message}
              hint={`${values.description.length}/3000 ký tự`}
            >
              <Textarea
                id="description"
                rows={4}
                className="rounded-lg bg-white focus-visible:border-champagne"
                aria-invalid={!!errors.description}
                {...register('description', {
                  validate: (v) => {
                    if (!v.trim()) return 'Vui lòng nhập mô tả shop.';
                    if (v.trim().length > 3000) return 'Mô tả tối đa 3000 ký tự.';
                    return true;
                  },
                })}
              />
            </FormField>
            <FormField
              label="Số điện thoại shop"
              htmlFor="phone"
              required
              error={errors.phone?.message}
              className="sm:max-w-xs"
            >
              <Input
                id="phone"
                inputMode="tel"
                className={inputClass}
                aria-invalid={!!errors.phone}
                {...register('phone', {
                  validate: (v) =>
                    /^0\d{9}$/.test(v.trim()) || 'Số điện thoại gồm số 0 và 9 chữ số.',
                })}
              />
            </FormField>

            <div id="dia-chi-lay-hang" className="scroll-mt-20 space-y-4 rounded-xl bg-ivory p-4">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-navy">
                  <MapPin className="size-4 text-champagne-600" /> Địa chỉ lấy hàng
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  GHN tới lấy hàng ở địa chỉ này.
                </p>
              </div>
              <LocationFields
                value={values.pickupAddress}
                onChange={(loc) => {
                  setValue('pickupAddress.provinceId', loc.provinceId, { shouldDirty: true });
                  setValue('pickupAddress.districtId', loc.districtId, { shouldDirty: true });
                  setValue('pickupAddress.wardCode', loc.wardCode, { shouldDirty: true });
                  clearErrors([
                    'pickupAddress.provinceId',
                    'pickupAddress.districtId',
                    'pickupAddress.wardCode',
                  ]);
                }}
                errors={{
                  provinceId: errors.pickupAddress?.provinceId?.message,
                  districtId: errors.pickupAddress?.districtId?.message,
                  wardCode: errors.pickupAddress?.wardCode?.message,
                }}
              />
              <FormField
                label="Số nhà, tên đường"
                htmlFor="street"
                required
                error={errors.pickupAddress?.street?.message}
              >
                <Input
                  id="street"
                  className={inputClass}
                  aria-invalid={!!errors.pickupAddress?.street}
                  {...register('pickupAddress.street', {
                    validate: (v) => {
                      if (!v.trim()) return 'Vui lòng nhập số nhà, tên đường.';
                      if (v.trim().length > 200) return 'Địa chỉ tối đa 200 ký tự.';
                      return true;
                    },
                  })}
                />
              </FormField>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-end">
          {suspended && <SuspendedNote className="sm:mr-auto" />}
          {dirty && (
            <Button
              type="button"
              variant="ghost"
              disabled={isSubmitting}
              onClick={() => reset(defaults(shop))}
            >
              Hoàn tác
            </Button>
          )}
          <Button
            type="submit"
            size="lg"
            className="rounded-full px-8"
            disabled={!dirty || isSubmitting || uploading || suspended}
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            Lưu thay đổi
          </Button>
        </div>
      </SectionCard>
    </form>
  );
}

/** Thông tin cần duyệt lại: tên shop, tài khoản ngân hàng */
function ReviewCard({ data, suspended }: { data: MyShop; suspended: boolean }) {
  const shop = data.shop!;
  const [dialog, setDialog] = useState<ChangeField | null>(null);
  const pending = data.changeRequest?.status === 'PENDING' ? data.changeRequest : null;
  const pendingFields = pending?.change?.fields ?? [];

  const rows: Array<{
    field: ChangeField;
    icon: typeof Store;
    label: string;
    value: React.ReactNode;
  }> = [
    { field: 'name', icon: Store, label: 'Tên shop', value: shop.name },
    {
      field: 'bankAccount',
      icon: Landmark,
      label: 'Tài khoản ngân hàng',
      value: shop.bankAccount ? (
        <span className="flex flex-wrap gap-x-1.5">
          <span className="font-medium whitespace-nowrap">{shop.bankAccount.bankName}</span>
          <span className="text-muted-foreground">·</span>
          <span className="whitespace-nowrap tabular-nums">
            {maskAccount(shop.bankAccount.accountNumber)}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="whitespace-nowrap">{shop.bankAccount.accountName}</span>
        </span>
      ) : (
        <span className="text-muted-foreground">Chưa có</span>
      ),
    },
  ];

  return (
    <SectionCard
      title="Thông tin cần duyệt lại"
      description="Đổi tên shop hoặc tài khoản nhận tiền phải được admin duyệt. Trong lúc chờ, shop vẫn dùng thông tin cũ."
    >
      <ul className="divide-y">
        {rows.map(({ field, icon: Icon, label, value }) => (
          <li
            key={field}
            className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {label}
                </div>
                <div className="mt-0.5 break-words text-ink">{value}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-13 sm:pl-0">
              {pendingFields.includes(field) && (
                <StatusBadge tone="pending">Đang chờ duyệt đổi</StatusBadge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-navy/30 text-navy"
                disabled={suspended}
                onClick={() => setDialog(field)}
              >
                Yêu cầu đổi
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {suspended && <SuspendedNote className="mt-4" />}
      <ChangeRequestDialog
        field={dialog}
        data={data}
        onOpenChange={(open) => !open && setDialog(null)}
      />
    </SectionCard>
  );
}

/** Ghi chú cạnh nút sửa bị khóa khi shop đang bị đình chỉ */
function SuspendedNote({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900',
        className,
      )}
    >
      <ShieldAlert className="size-3.5 shrink-0" />
      Shop đang bị đình chỉ nên tạm chưa sửa được hồ sơ shop.
    </p>
  );
}
