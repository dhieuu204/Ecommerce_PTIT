import type { UseFormRegisterReturn } from 'react-hook-form';
import { DigitsInput, Field, inputClass } from '@/components/form-bits';
import { BANKS } from '@/lib/banks';
import { cn } from '@/lib/utils';
import { toCardName } from '@/pages/account/shop-parts';

/** Ô tên chủ tài khoản: tự viết hoa, bỏ dấu như trên thẻ */
export function CardNameInput({ onChange, className, ...props }: React.ComponentProps<'input'>) {
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

/** Luật kiểm của 3 ô tài khoản ngân hàng (khớp BankAccountDto của backend) */
export const bankRules = {
  bankName: { required: 'Vui lòng chọn ngân hàng.' },
  accountNumber: {
    required: 'Vui lòng nhập số tài khoản.',
    pattern: { value: /^\d{6,20}$/, message: 'Số tài khoản gồm 6 đến 20 chữ số.' },
  },
  accountName: {
    validate: (x: string) => !!x.trim() || 'Vui lòng nhập tên chủ tài khoản.',
    maxLength: { value: 100, message: 'Tên chủ tài khoản tối đa 100 ký tự.' },
  },
} as const;

/** Ngân hàng, số tài khoản, tên chủ tài khoản: dùng ở hồ sơ cộng tác viên (P7) */
export function BankAccountFields({
  fields,
  errors,
  idPrefix = 'bank',
}: {
  fields: {
    bankName: UseFormRegisterReturn;
    accountNumber: UseFormRegisterReturn;
    accountName: UseFormRegisterReturn;
  };
  errors: { bankName?: string; accountNumber?: string; accountName?: string };
  idPrefix?: string;
}) {
  return (
    <div className="grid gap-5 sm:grid-cols-3">
      <Field id={`${idPrefix}-name`} label="Ngân hàng" error={errors.bankName}>
        <select
          id={`${idPrefix}-name`}
          className={inputClass}
          aria-invalid={!!errors.bankName}
          {...fields.bankName}
        >
          <option value="">Chọn ngân hàng</option>
          {BANKS.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-number`} label="Số tài khoản" error={errors.accountNumber}>
        <DigitsInput
          id={`${idPrefix}-number`}
          placeholder="6 đến 20 chữ số"
          aria-invalid={!!errors.accountNumber}
          {...fields.accountNumber}
        />
      </Field>
      <Field
        id={`${idPrefix}-holder`}
        label="Tên chủ tài khoản"
        error={errors.accountName}
        hint="Viết hoa không dấu, như trên thẻ."
      >
        <CardNameInput
          id={`${idPrefix}-holder`}
          placeholder="NGUYEN VAN AN"
          aria-invalid={!!errors.accountName}
          {...fields.accountName}
        />
      </Field>
    </div>
  );
}
