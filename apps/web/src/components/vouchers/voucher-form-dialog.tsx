import { useQueryClient } from '@tanstack/react-query';
import { BadgePercent, Banknote, Info, Loader2, Lock } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField, inputClass } from '@/components/console/form-field';
import { NumberInput } from '@/components/console/money-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, ApiError } from '@/lib/api';
import type { DiscountType, Voucher, VoucherInput } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { showApiError } from '@/lib/form';
import { PRODUCT_LIMITS } from '@/lib/product-limits';
import { cn } from '@/lib/utils';
import { VoucherPreview, type VoucherKind } from './voucher-ticket';
import { isoToVnInput, nowVnInput, VOUCHER_LIMITS as L, vnInputToIso } from './voucher-utils';

interface FormValues {
  code: string;
  name: string;
  discountType: DiscountType;
  value: number | null;
  maxDiscount: number | null;
  minOrder: number | null;
  /** datetime-local theo giờ Việt Nam */
  startAt: string;
  endAt: string;
  quantity: number | null;
  perUserLimit: number | null;
}

const DAY_MS = 86_400_000;

function defaults(v?: Voucher): FormValues {
  if (v) {
    return {
      code: v.code,
      name: v.name,
      discountType: v.discountType,
      value: v.value,
      maxDiscount: v.maxDiscount,
      minOrder: v.minOrder,
      startAt: isoToVnInput(v.startAt),
      endAt: isoToVnInput(v.endAt),
      quantity: v.quantity,
      perUserLimit: v.perUserLimit,
    };
  }
  // Gợi ý: bắt đầu sau 10 phút, chạy 30 ngày
  return {
    code: '',
    name: '',
    discountType: 'AMOUNT',
    value: null,
    maxDiscount: null,
    minOrder: 0,
    startAt: nowVnInput(10),
    endAt: nowVnInput(10 + 30 * 24 * 60),
    quantity: 100,
    perUserLimit: 1,
  };
}

/**
 * Tạo / sửa voucher (VCH-01), dùng chung cho voucher shop và voucher sàn.
 * Voucher đang diễn ra chỉ lùi được giờ kết thúc và tăng số lượt (các ô khác khóa).
 */
export function VoucherFormDialog({
  open,
  onOpenChange,
  voucher,
  kind,
  basePath,
  listKey,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Có = sửa */
  voucher?: Voucher | null;
  kind: VoucherKind;
  /** `${API.market}/shops/me/vouchers` hoặc `${API.market}/admin/vouchers` */
  basePath: string;
  listKey: readonly unknown[];
  onSaved?: (v: Voucher) => void;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!voucher;
  const locked = voucher?.state === 'RUNNING';
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setError,
    trigger,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(voucher ?? undefined), mode: 'onTouched' });

  // Mở lại cửa sổ (voucher khác hoặc tạo mới) thì điền lại từ đầu
  useEffect(() => {
    if (open) reset(defaults(voucher ?? undefined));
  }, [open, voucher, reset]);

  const values = watch();
  const percent = values.discountType === 'PERCENT';
  const original = voucher ? defaults(voucher) : null;

  /** Ô thời gian không đổi thì gửi lại đúng giá trị cũ (giữ giây, mili giây) */
  const timeToIso = (field: 'startAt' | 'endAt', input: string) =>
    voucher && original && input === original[field] ? voucher[field] : vnInputToIso(input);

  async function onSubmit(f: FormValues) {
    const body: VoucherInput = locked
      ? {
          // Đang chạy: gửi lại y nguyên các trường cũ, chỉ đổi giờ kết thúc và số lượt
          code: voucher.code,
          name: voucher.name,
          discountType: voucher.discountType,
          value: voucher.value,
          maxDiscount: voucher.maxDiscount,
          minOrder: voucher.minOrder,
          startAt: voucher.startAt,
          endAt: timeToIso('endAt', f.endAt)!,
          quantity: f.quantity!,
          perUserLimit: voucher.perUserLimit,
        }
      : {
          code: f.code.trim().toUpperCase(),
          name: f.name.trim(),
          discountType: f.discountType,
          value: f.value!,
          maxDiscount: f.discountType === 'PERCENT' ? f.maxDiscount : null,
          minOrder: f.minOrder ?? 0,
          startAt: timeToIso('startAt', f.startAt)!,
          endAt: timeToIso('endAt', f.endAt)!,
          quantity: f.quantity!,
          perUserLimit: f.perUserLimit ?? 1,
        };
    try {
      const saved = await api<Voucher>(isEdit ? `${basePath}/${voucher.id}` : basePath, {
        method: isEdit ? 'PUT' : 'POST',
        body,
      });
      await queryClient.invalidateQueries({ queryKey: listKey });
      toast.success(isEdit ? `Đã lưu voucher ${saved.code}.` : `Đã tạo voucher ${saved.code}.`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'VOUCHER_CODE_TAKEN') {
          setError('code', { type: 'server', message: e.message }, { shouldFocus: true });
          return;
        }
        if (e.code === 'VOUCHER_STARTED' || e.code === 'VOUCHER_ENDED') {
          // Voucher vừa đổi trạng thái (tới giờ bắt đầu / kết thúc): tải lại danh sách
          toast.error(
            e.code === 'VOUCHER_STARTED'
              ? `${e.message} Voucher đang chạy chỉ lùi được giờ kết thúc và tăng số lượt.`
              : e.message,
          );
          void queryClient.invalidateQueries({ queryKey: listKey });
          onOpenChange(false);
          return;
        }
      }
      showApiError(e, setError);
    }
  }

  const preview = {
    code: values.code.trim().toUpperCase(),
    name: values.name.trim(),
    discountType: values.discountType,
    value: values.value ?? 0,
    maxDiscount: values.maxDiscount,
    minOrder: values.minOrder ?? 0,
    startAt: vnInputToIso(values.startAt) ?? new Date().toISOString(),
    endAt: vnInputToIso(values.endAt) ?? new Date().toISOString(),
    quantity: values.quantity ?? 0,
    perUserLimit: values.perUserLimit ?? 1,
  };

  const lockHint = locked ? 'Voucher đang diễn ra nên không đổi được.' : undefined;

  return (
    <Dialog open={open} onOpenChange={(o) => !isSubmitting && onOpenChange(o)}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl p-0 sm:max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader className="border-b px-5 py-4 text-left md:px-6">
            <DialogTitle className="text-navy">
              {isEdit
                ? `Sửa voucher ${voucher.code}`
                : kind === 'shop'
                  ? 'Tạo voucher shop'
                  : 'Tạo voucher sàn'}
            </DialogTitle>
            <DialogDescription>
              {kind === 'shop'
                ? 'Voucher shop: shop chịu phần tiền giảm.'
                : 'Voucher sàn: sàn chịu phần tiền giảm, dùng được cho đơn của mọi shop.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 px-5 py-5 md:px-6">
            {locked && (
              <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <Lock className="mt-0.5 size-4 shrink-0 text-amber-700" />
                <div>
                  <b className="font-semibold">Voucher đang diễn ra.</b> Chỉ lùi được giờ kết thúc
                  về sau và tăng tổng số lượt; các ô khác đã khóa.
                </div>
              </div>
            )}

            <VoucherPreview v={preview} kind={kind} />

            {/* Thông tin chung */}
            <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <FormField
                label="Mã voucher"
                htmlFor="v-code"
                required
                error={errors.code?.message}
                hint={
                  lockHint ?? `${L.codeMin}–${L.codeMax} chữ in hoa hoặc số, không trùng trên sàn.`
                }
              >
                <Input
                  id="v-code"
                  autoComplete="off"
                  maxLength={L.codeMax}
                  placeholder="GIAM50K"
                  disabled={locked}
                  aria-invalid={!!errors.code}
                  className={cn(inputClass, 'font-mono tracking-wider uppercase')}
                  {...register('code', {
                    setValueAs: (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    validate: (v) => {
                      if (!v) return 'Vui lòng nhập mã voucher.';
                      if (!/^[A-Z0-9]+$/.test(v)) return 'Mã chỉ gồm chữ in hoa và số, không dấu.';
                      if (v.length < L.codeMin || v.length > L.codeMax)
                        return `Mã dài từ ${L.codeMin} đến ${L.codeMax} ký tự.`;
                      return true;
                    },
                    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
                      // gõ chữ thường, có dấu cách: đổi ngay thành in hoa, bỏ ký tự lạ
                      const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      if (clean !== e.target.value) e.target.value = clean;
                    },
                  })}
                />
              </FormField>
              <FormField
                label="Tên voucher"
                htmlFor="v-name"
                required
                error={errors.name?.message}
                hint={lockHint ?? 'Ví dụ: Giảm 50K cho đơn từ 500K.'}
              >
                <Input
                  id="v-name"
                  maxLength={L.nameMax}
                  disabled={locked}
                  aria-invalid={!!errors.name}
                  className={inputClass}
                  {...register('name', {
                    validate: (v) => {
                      const n = v.trim().length;
                      if (!n) return 'Vui lòng nhập tên voucher.';
                      if (n < L.nameMin || n > L.nameMax)
                        return `Tên voucher dài từ ${L.nameMin} đến ${L.nameMax} ký tự.`;
                      return true;
                    },
                  })}
                />
              </FormField>
            </div>

            {/* Mức giảm */}
            <fieldset className="space-y-4" disabled={locked}>
              <legend className="mb-2 text-sm font-semibold text-navy">Mức giảm</legend>
              <Controller
                control={control}
                name="discountType"
                render={({ field }) => (
                  <div
                    role="radiogroup"
                    aria-label="Loại giảm giá"
                    className="grid grid-cols-2 gap-2 rounded-xl bg-ivory p-1"
                  >
                    {(
                      [
                        { value: 'AMOUNT', label: 'Giảm số tiền', icon: Banknote },
                        { value: 'PERCENT', label: 'Giảm theo %', icon: BadgePercent },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={field.value === value}
                        onClick={() => {
                          if (field.value === value) return;
                          field.onChange(value);
                          if (getValues('value') !== null) void trigger('value');
                        }}
                        className={cn(
                          'flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed',
                          field.value === value
                            ? 'bg-white text-navy shadow-sm ring-1 ring-champagne/60'
                            : 'text-muted-foreground hover:text-ink',
                        )}
                      >
                        <Icon className="size-4" /> {label}
                      </button>
                    ))}
                  </div>
                )}
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <Controller
                  control={control}
                  name="value"
                  rules={{
                    validate: (v) => {
                      if (v === null) return 'Vui lòng nhập mức giảm.';
                      if (getValues('discountType') === 'PERCENT') {
                        if (v < 1 || v > L.percentMax)
                          return `Giảm theo % từ 1 đến ${L.percentMax}.`;
                      } else {
                        if (v < L.amountMin) return `Mức giảm ít nhất ${formatMoney(L.amountMin)}.`;
                        if (v > L.money) return 'Mức giảm quá lớn.';
                      }
                      return true;
                    },
                  }}
                  render={({ field, fieldState }) => (
                    <FormField
                      label={percent ? 'Phần trăm giảm' : 'Số tiền giảm'}
                      htmlFor="v-value"
                      required
                      error={fieldState.error?.message}
                      hint={percent ? `1–${L.percentMax}%` : `Từ ${formatMoney(L.amountMin)}`}
                    >
                      <NumberInput
                        id="v-value"
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        suffix={percent ? '%' : 'đ'}
                        maxDigits={percent ? 2 : 10}
                        disabled={locked}
                        aria-invalid={!!fieldState.error}
                      />
                    </FormField>
                  )}
                />
                {percent && (
                  <Controller
                    control={control}
                    name="maxDiscount"
                    shouldUnregister
                    rules={{
                      validate: (v) => {
                        if (v === null) return 'Vui lòng nhập mức giảm tối đa.';
                        if (v < L.maxDiscountMin)
                          return `Giảm tối đa ít nhất ${formatMoney(L.maxDiscountMin)}.`;
                        if (v > L.money) return 'Mức giảm tối đa quá lớn.';
                        return true;
                      },
                    }}
                    render={({ field, fieldState }) => (
                      <FormField
                        label="Giảm tối đa"
                        htmlFor="v-max"
                        required
                        error={fieldState.error?.message}
                        hint="Trần số tiền giảm"
                      >
                        <NumberInput
                          id="v-max"
                          ref={field.ref}
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          suffix="đ"
                          disabled={locked}
                          aria-invalid={!!fieldState.error}
                        />
                      </FormField>
                    )}
                  />
                )}
                <Controller
                  control={control}
                  name="minOrder"
                  rules={{
                    validate: (v) => (v === null || v <= L.money ? true : 'Đơn tối thiểu quá lớn.'),
                  }}
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Đơn tối thiểu"
                      htmlFor="v-min"
                      error={fieldState.error?.message}
                      hint="Tiền hàng; 0 = mọi đơn"
                    >
                      <NumberInput
                        id="v-min"
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        suffix="đ"
                        disabled={locked}
                        aria-invalid={!!fieldState.error}
                      />
                    </FormField>
                  )}
                />
              </div>
            </fieldset>

            {/* Thời gian */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-navy">
                Thời gian (giờ Việt Nam)
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  label="Bắt đầu"
                  htmlFor="v-start"
                  required
                  error={errors.startAt?.message}
                  hint={lockHint ?? 'Từ bây giờ trở đi.'}
                >
                  <Input
                    id="v-start"
                    type="datetime-local"
                    disabled={locked}
                    aria-invalid={!!errors.startAt}
                    className={inputClass}
                    {...register('startAt', {
                      validate: (v) => {
                        if (locked) return true;
                        const iso = vnInputToIso(v);
                        if (!iso) return 'Vui lòng chọn thời gian bắt đầu.';
                        if (original && v === original.startAt) return true;
                        if (new Date(iso).getTime() < Date.now() - 60_000)
                          return 'Thời gian bắt đầu phải từ bây giờ trở đi.';
                        return true;
                      },
                      onChange: () => {
                        if (getValues('endAt')) void trigger('endAt');
                      },
                    })}
                  />
                </FormField>
                <FormField
                  label="Kết thúc"
                  htmlFor="v-end"
                  required
                  error={errors.endAt?.message}
                  hint={
                    locked
                      ? 'Chỉ lùi về sau giờ kết thúc hiện tại.'
                      : `Sau lúc bắt đầu, dài tối đa ${PRODUCT_LIMITS.voucherMaxDays} ngày.`
                  }
                >
                  <Input
                    id="v-end"
                    type="datetime-local"
                    aria-invalid={!!errors.endAt}
                    className={inputClass}
                    {...register('endAt', {
                      validate: (v) => {
                        const end = vnInputToIso(v);
                        if (!end) return 'Vui lòng chọn thời gian kết thúc.';
                        const startIso = timeToIso('startAt', getValues('startAt'));
                        const endMs = new Date(timeToIso('endAt', v) ?? end).getTime();
                        if (locked && voucher && endMs < new Date(voucher.endAt).getTime())
                          return 'Voucher đang diễn ra chỉ lùi được giờ kết thúc về sau.';
                        if (!startIso) return true;
                        const startMs = new Date(startIso).getTime();
                        if (endMs <= startMs) return 'Thời gian kết thúc phải sau lúc bắt đầu.';
                        if (endMs - startMs > PRODUCT_LIMITS.voucherMaxDays * DAY_MS)
                          return `Voucher chạy tối đa ${PRODUCT_LIMITS.voucherMaxDays} ngày.`;
                        return true;
                      },
                    })}
                  />
                </FormField>
              </div>
            </fieldset>

            {/* Lượt dùng */}
            <fieldset className="space-y-3">
              <legend className="mb-2 text-sm font-semibold text-navy">Lượt dùng</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Controller
                  control={control}
                  name="quantity"
                  rules={{
                    validate: (v) => {
                      if (v === null || v < 1) return 'Số lượt ít nhất là 1.';
                      if (v > L.quantityMax)
                        return `Số lượt tối đa ${L.quantityMax.toLocaleString('vi-VN')}.`;
                      if (locked && voucher && v < voucher.quantity)
                        return `Voucher đang diễn ra chỉ tăng được số lượt (hiện ${voucher.quantity}).`;
                      return true;
                    },
                  }}
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Tổng số lượt"
                      htmlFor="v-qty"
                      required
                      error={fieldState.error?.message}
                      hint={
                        locked
                          ? `Chỉ tăng thêm (hiện ${voucher!.quantity.toLocaleString('vi-VN')}).`
                          : 'Số lần voucher được dùng trên toàn sàn.'
                      }
                    >
                      <NumberInput
                        id="v-qty"
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        maxDigits={7}
                        aria-invalid={!!fieldState.error}
                      />
                    </FormField>
                  )}
                />
                <Controller
                  control={control}
                  name="perUserLimit"
                  rules={{
                    validate: (v) => {
                      if (v === null || v < 1) return 'Mỗi người dùng được ít nhất 1 lần.';
                      if (v > L.quantityMax) return 'Số lần mỗi người quá lớn.';
                      return true;
                    },
                  }}
                  render={({ field, fieldState }) => (
                    <FormField
                      label="Mỗi người dùng tối đa"
                      htmlFor="v-per"
                      required
                      error={fieldState.error?.message}
                      hint={lockHint ?? 'Số lần một tài khoản được dùng.'}
                    >
                      <NumberInput
                        id="v-per"
                        ref={field.ref}
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        suffix="lần"
                        maxDigits={7}
                        disabled={locked}
                        inputClassName="pr-10"
                        aria-invalid={!!fieldState.error}
                      />
                    </FormField>
                  )}
                />
              </div>
            </fieldset>

            <p className="flex gap-2 rounded-lg bg-ivory px-3 py-2 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0 text-champagne-600" />
              Người mua sẽ áp được voucher khi tính năng đặt hàng ra mắt.
              {kind === 'platform' && ' Voucher sàn do sàn chịu chi phí.'}
            </p>
          </div>

          <DialogFooter className="sticky bottom-0 border-t bg-white/95 px-5 py-3 backdrop-blur md:px-6">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" className="min-w-32 rounded-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isEdit ? 'Lưu thay đổi' : 'Tạo voucher'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
