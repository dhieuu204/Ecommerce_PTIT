import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, MapPin, Pencil, Phone, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useController, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Field, inputClass, PHONE_PATTERN, SubmitButton } from '@/components/form-bits';
import { LocationFields } from '@/components/location-fields';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { showApiError } from '@/lib/form';
import { LIMITS } from '@/lib/limits';
import type { Address } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Notice } from '../auth/auth-parts';
import { AccountCard } from './account-parts';

const ADDRESSES_KEY = ['addresses'] as const;

/** Địa chỉ đầy đủ bằng chữ: "Phường Dịch Vọng, Quận Cầu Giấy, Hà Nội" */
const placeText = (a: Address) => [a.wardName, a.districtName, a.provinceName].join(', ');

/** Sổ địa chỉ (ACC-04, màn hình G): tối đa 10, địa chỉ đầu tiên tự thành mặc định. */
export function AddressesPage() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const key = [...ADDRESSES_KEY, user?.id];
  const list = useQuery({
    queryKey: key,
    queryFn: () => api<Address[]>(`${API.user}/me/addresses`),
    enabled: !!user,
  });
  const [editing, setEditing] = useState<Address | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Address | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY });

  const setDefault = useMutation({
    mutationFn: (id: string) => api(`${API.user}/me/addresses/${id}/default`, { method: 'POST' }),
    onSuccess: async () => {
      await invalidate();
      toast.success('Đã đặt làm địa chỉ mặc định.');
    },
    onError: (e) => showApiError(e),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${API.user}/me/addresses/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      setDeleting(null);
      toast.success('Đã xóa địa chỉ.');
    },
    onError: (e) => showApiError(e),
  });

  const items = list.data ?? [];
  const full = items.length >= LIMITS.maxAddresses;

  return (
    <AccountCard
      title="Sổ địa chỉ"
      description={
        list.data ? (
          <>
            {items.length}/{LIMITS.maxAddresses} địa chỉ
            {full && <span className="text-amber-700"> · Đã đủ {LIMITS.maxAddresses} địa chỉ</span>}
          </>
        ) : (
          'Địa chỉ nhận hàng của bạn'
        )
      }
      actions={
        items.length > 0 && (
          <Button
            onClick={() => setEditing('new')}
            disabled={!list.data || full}
            title={full ? `Tối đa ${LIMITS.maxAddresses} địa chỉ` : undefined}
            className="h-10 w-full rounded-lg bg-navy px-5 text-white hover:bg-navy-800 sm:w-auto"
          >
            <Plus /> Thêm địa chỉ
          </Button>
        )
      }
    >
      {list.isPending ? (
        <div className="divide-y">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-2 py-5 first:pt-0">
              <Skeleton className="h-5 w-56" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-72" />
            </div>
          ))}
        </div>
      ) : list.isError ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          <p>{list.error.message}</p>
          <Button variant="outline" className="mt-4" onClick={() => list.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-champagne-50 text-champagne-600">
            <MapPin className="size-7" />
          </span>
          <h2 className="mt-4 font-semibold text-navy">Chưa có địa chỉ nào</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Thêm địa chỉ nhận hàng để đặt hàng nhanh hơn. Địa chỉ đầu tiên sẽ là địa chỉ mặc định.
          </p>
          <Button
            onClick={() => setEditing('new')}
            className="mt-5 rounded-full bg-navy px-6 text-white hover:bg-navy-800"
          >
            <Plus /> Thêm địa chỉ đầu tiên
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((a) => (
            <li
              key={a.id}
              className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold break-words text-navy">{a.receiverName}</span>
                  <span className="hidden h-4 w-px bg-border sm:block" />
                  <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                    <Phone className="size-3.5" /> {a.phone}
                  </span>
                </div>
                <p className="text-sm break-words text-ink">{a.street}</p>
                <p className="text-sm text-muted-foreground">{placeText(a)}</p>
                {a.isDefault && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-md border border-champagne bg-champagne-50 px-2 py-0.5 text-xs font-medium text-champagne-600">
                    <Star className="size-3 fill-current" /> Mặc định
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-col sm:items-end">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-navy"
                    onClick={() => setEditing(a)}
                  >
                    <Pencil /> Sửa
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:bg-red-50 hover:text-destructive"
                    onClick={() => setDeleting(a)}
                  >
                    <Trash2 /> Xóa
                  </Button>
                </div>
                {!a.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setDefault.isPending}
                    onClick={() => setDefault.mutate(a.id)}
                    className="rounded-lg"
                  >
                    {setDefault.isPending && setDefault.variables === a.id && (
                      <Loader2 className="animate-spin" />
                    )}
                    Đặt làm mặc định
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <AddressDialog
        key={editing === null ? 'closed' : editing === 'new' ? 'new' : editing.id}
        editing={editing}
        isFirst={items.length === 0}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && !remove.isPending && setDeleting(null)}>
        <DialogContent className="rounded-2xl bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy">Xóa địa chỉ này?</DialogTitle>
            <DialogDescription>
              {deleting?.isDefault
                ? 'Đây là địa chỉ mặc định. Sau khi xóa, địa chỉ mới nhất còn lại sẽ thành mặc định.'
                : 'Địa chỉ sẽ bị xóa khỏi sổ, không khôi phục được.'}
            </DialogDescription>
          </DialogHeader>
          {deleting && (
            <div className="rounded-xl border bg-ivory px-4 py-3 text-sm">
              <div className="font-medium text-navy">
                {deleting.receiverName} · {deleting.phone}
              </div>
              <div className="mt-0.5 text-muted-foreground">
                {deleting.street}, {placeText(deleting)}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={remove.isPending}>
              Hủy
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              {remove.isPending && <Loader2 className="animate-spin" />}
              Xóa địa chỉ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AccountCard>
  );
}

interface AddressForm {
  receiverName: string;
  phone: string;
  provinceId: number | undefined;
  districtId: number | undefined;
  wardCode: string | undefined;
  street: string;
  isDefault: boolean;
}

/** Cửa sổ thêm/sửa địa chỉ */
function AddressDialog({
  editing,
  isFirst,
  onClose,
  onSaved,
}: {
  editing: Address | 'new' | null;
  isFirst: boolean;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const current = editing && editing !== 'new' ? editing : null;
  const user = useCurrentUser();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AddressForm>({
    defaultValues: current
      ? {
          receiverName: current.receiverName,
          phone: current.phone,
          provinceId: current.provinceId,
          districtId: current.districtId,
          wardCode: current.wardCode,
          street: current.street,
          isDefault: current.isDefault,
        }
      : {
          receiverName: isFirst ? (user?.fullName ?? '') : '',
          phone: '',
          provinceId: undefined,
          districtId: undefined,
          wardCode: undefined,
          street: '',
          isDefault: isFirst,
        },
  });
  const province = useController({
    control,
    name: 'provinceId',
    rules: { required: 'Vui lòng chọn tỉnh/thành.' },
  });
  const district = useController({
    control,
    name: 'districtId',
    rules: { required: 'Vui lòng chọn quận/huyện.' },
  });
  const ward = useController({
    control,
    name: 'wardCode',
    rules: { required: 'Vui lòng chọn phường/xã.' },
  });
  const isDefault = watch('isDefault');
  const lockDefault = isFirst || !!current?.isDefault;

  const onSubmit = handleSubmit(async (v) => {
    setFormError(null);
    const body = {
      receiverName: v.receiverName.trim(),
      phone: v.phone.trim(),
      provinceId: v.provinceId,
      districtId: v.districtId,
      wardCode: v.wardCode,
      street: v.street.trim(),
    };
    try {
      if (current) {
        await api(`${API.user}/me/addresses/${current.id}`, { method: 'PATCH', body });
        if (v.isDefault && !current.isDefault) {
          await api(`${API.user}/me/addresses/${current.id}/default`, { method: 'POST' });
        }
      } else {
        await api(`${API.user}/me/addresses`, {
          method: 'POST',
          body: { ...body, isDefault: v.isDefault },
        });
      }
      await onSaved();
      toast.success(current ? 'Đã lưu địa chỉ.' : 'Đã thêm địa chỉ.');
      onClose();
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fields).length === 0) {
        setFormError(e.message);
      } else {
        showApiError(e, setError);
      }
    }
  });

  return (
    <Dialog open={editing !== null} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-2xl bg-card p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-6 py-4 text-left">
          <DialogTitle className="text-navy">
            {current ? 'Sửa địa chỉ' : 'Thêm địa chỉ'}
          </DialogTitle>
          <DialogDescription>Shipper GHN sẽ giao tới địa chỉ này.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4 px-6 py-5">
          {formError && (
            <Notice tone="danger" icon={<AlertCircle />}>
              {formError}
            </Notice>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="receiverName" label="Họ tên người nhận" error={errors.receiverName?.message}>
              <input
                id="receiverName"
                autoComplete="name"
                placeholder="Ví dụ: Nguyễn Văn An"
                className={inputClass}
                aria-invalid={!!errors.receiverName}
                {...register('receiverName', {
                  validate: (x) => !!x.trim() || 'Vui lòng nhập tên người nhận.',
                  maxLength: { value: 100, message: 'Tên người nhận tối đa 100 ký tự.' },
                })}
              />
            </Field>
            <Field id="phone" label="Số điện thoại" error={errors.phone?.message}>
              <input
                id="phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="0912345678"
                className={inputClass}
                aria-invalid={!!errors.phone}
                {...register('phone', {
                  required: 'Vui lòng nhập số điện thoại.',
                  pattern: { value: PHONE_PATTERN, message: 'Số điện thoại gồm số 0 và 9 chữ số.' },
                })}
              />
            </Field>
          </div>
          <LocationFields
            className="sm:grid-cols-1"
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
          <Field id="street" label="Số nhà, tên đường" error={errors.street?.message}>
            <input
              id="street"
              autoComplete="street-address"
              placeholder="Ví dụ: 12 Nguyễn Trãi"
              className={inputClass}
              aria-invalid={!!errors.street}
              {...register('street', {
                validate: (x) => !!x.trim() || 'Vui lòng nhập số nhà, tên đường.',
                maxLength: { value: 200, message: 'Địa chỉ tối đa 200 ký tự.' },
              })}
            />
          </Field>
          <label
            className={cn(
              'flex items-center gap-3 rounded-xl border px-4 py-3 text-sm',
              lockDefault ? 'cursor-default bg-ivory' : 'cursor-pointer hover:border-champagne/60',
            )}
          >
            <Checkbox
              checked={isDefault}
              disabled={lockDefault}
              onCheckedChange={(c) => setValue('isDefault', c === true)}
              className="size-5 rounded-[5px] data-[state=checked]:border-navy data-[state=checked]:bg-navy"
            />
            <span>
              Đặt làm địa chỉ mặc định
              {lockDefault && (
                <span className="block text-xs text-muted-foreground">
                  {isFirst ? 'Địa chỉ đầu tiên luôn là mặc định.' : 'Đây đang là địa chỉ mặc định.'}
                </span>
              )}
            </span>
          </label>
          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Hủy
            </Button>
            <SubmitButton pending={isSubmitting}>
              {current ? 'Lưu địa chỉ' : 'Thêm địa chỉ'}
            </SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
