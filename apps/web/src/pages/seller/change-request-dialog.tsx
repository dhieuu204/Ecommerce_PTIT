import { useQueryClient } from '@tanstack/react-query';
import { Info, Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField, inputClass, nativeSelectClass } from '@/components/console/form-field';
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
import { MY_SHOP_KEY } from '@/hooks/use-my-shop';
import { API, api, ApiError } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { BANKS } from '@/lib/banks';
import { maskAccount } from '@/lib/format';
import { newIdempotencyKey, showApiError } from '@/lib/form';
import type { BankAccount, MyShop } from '@/lib/types';

export type ChangeField = 'name' | 'bankAccount';

interface ChangeForm {
  name: string;
  bankAccount: BankAccount;
}

/**
 * Cửa sổ "Yêu cầu đổi" tên shop hoặc tài khoản ngân hàng (SHP-03).
 * Yêu cầu mới thay yêu cầu đang chờ, nên mục đang chờ khác được gửi kèm để không bị mất.
 */
export function ChangeRequestDialog({
  field,
  data,
  onOpenChange,
}: {
  field: ChangeField | null;
  data: MyShop;
  onOpenChange: (open: boolean) => void;
}) {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const shop = data.shop!;
  const pending = data.changeRequest?.status === 'PENDING' ? data.changeRequest.change : undefined;
  const keyRef = useRef(newIdempotencyKey());

  const initial = (): ChangeForm => ({
    name: pending?.name ?? shop.name ?? '',
    bankAccount: pending?.bankAccount ??
      shop.bankAccount ?? { bankName: '', accountNumber: '', accountName: '' },
  });
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ChangeForm>({ defaultValues: initial() });

  // Mỗi lần mở: điền giá trị đang dùng (hoặc giá trị đang chờ) và sinh mã chống gửi lặp mới
  useEffect(() => {
    if (field) {
      reset(initial());
      keyRef.current = newIdempotencyKey();
    }
  }, [field]);

  /** Mục đang chờ khác mục đang sửa: gửi kèm để yêu cầu mới không làm mất nó */
  const keepName = field === 'bankAccount' && pending?.fields.includes('name');
  const keepBank = field === 'name' && pending?.fields.includes('bankAccount');

  async function onSubmit(v: ChangeForm) {
    const body: Record<string, unknown> = {};
    if (field === 'name' || keepName) body.name = field === 'name' ? v.name.trim() : pending!.name;
    if (field === 'bankAccount' || keepBank) {
      body.bankAccount =
        field === 'bankAccount'
          ? {
              bankName: v.bankAccount.bankName,
              accountNumber: v.bankAccount.accountNumber.trim(),
              accountName: v.bankAccount.accountName.trim().toUpperCase(),
            }
          : pending!.bankAccount;
    }
    try {
      const result = await api<MyShop>(`${API.market}/shops/me/change-requests`, {
        method: 'POST',
        body,
        idempotencyKey: keyRef.current,
      });
      queryClient.setQueryData([...MY_SHOP_KEY, user?.id], result);
      toast.success('Đã gửi yêu cầu đổi. Admin sẽ duyệt trong thời gian sớm nhất.');
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'NOTHING_TO_CHANGE') {
          const target = field === 'name' ? 'name' : 'bankAccount.accountNumber';
          setError(target, {
            message: 'Giá trị mới đang giống thông tin hiện tại, bạn sửa lại nhé.',
          });
          return;
        }
        if (e.code === 'SHOP_NAME_TAKEN') {
          setError('name', { message: e.message }, { shouldFocus: true });
          return;
        }
        if (e.code === 'SHOP_NOT_ACTIVE') {
          toast.error(e.message);
          onOpenChange(false);
          void queryClient.invalidateQueries({ queryKey: MY_SHOP_KEY });
          return;
        }
      }
      showApiError(e, setError);
    }
  }

  const bank = shop.bankAccount;
  return (
    <Dialog open={!!field} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-5">
          <DialogHeader className="text-left">
            <DialogTitle className="text-navy">
              {field === 'name' ? 'Yêu cầu đổi tên shop' : 'Yêu cầu đổi tài khoản ngân hàng'}
            </DialogTitle>
            <DialogDescription>
              Admin duyệt xong thông tin mới mới được dùng. Trong lúc chờ, shop vẫn bán bằng thông
              tin cũ.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-champagne/40 bg-champagne-50/60 px-4 py-3 text-sm">
            <span className="text-muted-foreground">Đang dùng: </span>
            <span className="font-medium text-ink">
              {field === 'name'
                ? shop.name
                : bank
                  ? `${bank.bankName} · ${maskAccount(bank.accountNumber)} · ${bank.accountName}`
                  : 'Chưa có'}
            </span>
          </div>

          {field === 'name' ? (
            <FormField label="Tên shop mới" htmlFor="cr-name" required error={errors.name?.message}>
              <Input
                id="cr-name"
                autoFocus
                className={inputClass}
                aria-invalid={!!errors.name}
                {...register('name', {
                  validate: (v) => {
                    const t = v.trim();
                    if (t.length < 3 || t.length > 80) return 'Tên shop từ 3 đến 80 ký tự.';
                    return true;
                  },
                })}
              />
            </FormField>
          ) : (
            <div className="grid gap-4">
              <FormField
                label="Ngân hàng"
                htmlFor="cr-bank"
                required
                error={errors.bankAccount?.bankName?.message}
              >
                <select
                  id="cr-bank"
                  className={nativeSelectClass}
                  aria-invalid={!!errors.bankAccount?.bankName}
                  {...register('bankAccount.bankName', {
                    required: 'Vui lòng chọn ngân hàng.',
                  })}
                >
                  <option value="">Chọn ngân hàng</option>
                  {BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Số tài khoản"
                htmlFor="cr-number"
                required
                error={errors.bankAccount?.accountNumber?.message}
              >
                <Input
                  id="cr-number"
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${inputClass} font-mono tracking-wide`}
                  aria-invalid={!!errors.bankAccount?.accountNumber}
                  {...register('bankAccount.accountNumber', {
                    validate: (v) =>
                      /^\d{6,20}$/.test(v.trim()) || 'Số tài khoản gồm 6 đến 20 chữ số.',
                  })}
                />
              </FormField>
              <FormField
                label="Tên chủ tài khoản"
                htmlFor="cr-holder"
                required
                hint="Viết hoa không dấu, đúng như trên thẻ."
                error={errors.bankAccount?.accountName?.message}
              >
                <Input
                  id="cr-holder"
                  className={`${inputClass} uppercase`}
                  aria-invalid={!!errors.bankAccount?.accountName}
                  {...register('bankAccount.accountName', {
                    validate: (v) => {
                      if (!v.trim()) return 'Vui lòng nhập tên chủ tài khoản.';
                      if (v.trim().length > 100) return 'Tên chủ tài khoản tối đa 100 ký tự.';
                      return true;
                    },
                  })}
                />
              </FormField>
            </div>
          )}

          {(keepName || keepBank || pending?.fields.includes(field ?? 'name')) && (
            <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-900">
              <Info className="mt-0.5 size-4 shrink-0 text-amber-600" />
              <div>
                Bạn đang có một yêu cầu đổi chờ duyệt. Gửi yêu cầu này sẽ thay yêu cầu cũ.
                {keepName && <> Tên shop mới "{pending?.name}" vẫn được giữ trong yêu cầu.</>}
                {keepBank && pending?.bankAccount && (
                  <>
                    {' '}
                    Tài khoản {pending.bankAccount.bankName}{' '}
                    {maskAccount(pending.bankAccount.accountNumber)} vẫn được giữ trong yêu cầu.
                  </>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" disabled={isSubmitting} className="min-w-36">
              {isSubmitting && <Loader2 className="animate-spin" />}
              Gửi yêu cầu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
