import { GripVertical, PackagePlus, Plus, RotateCcw, Trash2, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { Controller, type Control, type FieldErrors, type UseFormGetValues } from 'react-hook-form';
import { NumberInput } from '@/components/console/money-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SellerVariant } from '@/lib/catalog-types';
import { PRODUCT_LIMITS } from '@/lib/product-limits';
import { cn } from '@/lib/utils';
import { ValueImageButton } from './product-images';

/** Một lựa chọn của nhóm phân loại; `key` cố định để đổi tên không mất giá/tồn của dòng */
export interface OptionValue {
  key: string;
  label: string;
  /** Chỉ nhóm 1: ảnh riêng của lựa chọn (ảnh theo màu) */
  image: string | null;
}
export interface OptionGroup {
  key: string;
  name: string;
  values: OptionValue[];
}

/** Giá/tồn của một dòng biến thể trong form */
export interface RowValues {
  price: number | null;
  originalPrice: number | null;
  /** Chỉ biến thể mới: tồn ban đầu */
  stock: number | null;
}
export const emptyRow = (): RowValues => ({ price: null, originalPrice: null, stock: null });

/** Dòng của bảng biến thể (tổ hợp lựa chọn) */
export interface RowSpec {
  key: string;
  v1: OptionValue | null;
  v2: OptionValue | null;
}

export const SINGLE = 'single';
export const newKey = () => `k${Math.random().toString(36).slice(2, 9)}`;
export const rowKey = (k1: string, k2: string | null) => `${k1}_${k2 ?? 'x'}`;

/** Các dòng biến thể = tích Đề-các các lựa chọn, trừ tổ hợp seller đã bỏ */
export function buildRows(groups: OptionGroup[], removed: string[]): RowSpec[] {
  const g1 = groups[0]?.values ?? [];
  const g2 = groups[1]?.values ?? [];
  const rows: RowSpec[] = g1.flatMap((a) =>
    g2.length
      ? g2.map((b): RowSpec => ({ key: rowKey(a.key, b.key), v1: a, v2: b }))
      : [{ key: rowKey(a.key, null), v1: a, v2: null }],
  );
  return rows.filter((r) => !removed.includes(r.key));
}

/** Lỗi phần cấu trúc (nhóm, lựa chọn, ảnh) không nằm trong react-hook-form */
export type StructErrors = Record<string, string | undefined>;

/**
 * Sửa các nhóm phân loại: tên nhóm (ví dụ "Màu sắc") và các lựa chọn (tối đa 10). Nhóm 1 có ảnh
 * riêng cho từng lựa chọn.
 */
export function VariantGroupsEditor({
  groups,
  onRename,
  onAddValue,
  onRemoveValue,
  onRenameValue,
  onValueImage,
  onAddGroup,
  onRemoveGroup,
  errors,
}: {
  groups: OptionGroup[];
  onRename: (gi: number, name: string) => void;
  onAddValue: (gi: number) => void;
  onRemoveValue: (gi: number, key: string) => void;
  onRenameValue: (gi: number, key: string, label: string) => void;
  onValueImage: (key: string, url: string | null) => void;
  onAddGroup: () => void;
  onRemoveGroup: (gi: number) => void;
  errors: StructErrors;
}) {
  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <div key={g.key} className="rounded-xl border bg-ivory/60 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-2 inline-flex h-6 shrink-0 items-center rounded-full bg-navy px-2.5 text-[11px] font-semibold text-white">
              Nhóm {gi + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <Input
                value={g.name}
                maxLength={PRODUCT_LIMITS.optionMax}
                onChange={(e) => onRename(gi, e.target.value)}
                placeholder={gi === 0 ? 'Tên nhóm, ví dụ: Màu sắc' : 'Tên nhóm, ví dụ: Dung lượng'}
                aria-label={`Tên nhóm phân loại ${gi + 1}`}
                aria-invalid={!!errors[`group.${gi}.name`]}
                className="h-10 rounded-lg bg-white font-medium focus-visible:border-champagne sm:max-w-xs"
              />
              {errors[`group.${gi}.name`] && (
                <p className="text-xs text-destructive">{errors[`group.${gi}.name`]}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="mt-1 rounded-full text-muted-foreground hover:text-red-600"
              onClick={() => onRemoveGroup(gi)}
              aria-label={`Xóa nhóm phân loại ${gi + 1}`}
            >
              <X />
            </Button>
          </div>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {g.values.map((v, vi) => {
              const err = errors[`value.${v.key}`] ?? errors[`image.${v.key}`];
              return (
                <div key={v.key} className="space-y-1">
                  <div className="flex items-center gap-2">
                    {gi === 0 && (
                      <ValueImageButton
                        url={v.image}
                        label={v.label || `lựa chọn ${vi + 1}`}
                        invalid={!!errors[`image.${v.key}`]}
                        onChange={(url) => onValueImage(v.key, url)}
                      />
                    )}
                    <div className="relative min-w-0 flex-1">
                      <Input
                        value={v.label}
                        maxLength={PRODUCT_LIMITS.optionMax}
                        onChange={(e) => onRenameValue(gi, v.key, e.target.value)}
                        placeholder={
                          gi === 0 ? `Ví dụ: ${['Đen', 'Trắng', 'Xanh'][vi % 3]}` : 'Ví dụ: 256GB'
                        }
                        aria-label={`Lựa chọn ${vi + 1} của nhóm ${gi + 1}`}
                        aria-invalid={!!errors[`value.${v.key}`]}
                        data-value-key={v.key}
                        className="h-10 rounded-lg bg-white pr-9 focus-visible:border-champagne"
                      />
                      <button
                        type="button"
                        onClick={() => onRemoveValue(gi, v.key)}
                        disabled={g.values.length <= 1}
                        className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                        aria-label={`Xóa lựa chọn ${v.label || vi + 1}`}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {err && <p className="text-xs text-destructive">{err}</p>}
                </div>
              );
            })}
            {g.values.length < PRODUCT_LIMITS.maxOptions && (
              <button
                type="button"
                onClick={() => onAddValue(gi)}
                className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-dashed border-champagne/60 bg-white text-sm text-navy transition hover:border-champagne hover:bg-champagne-50/60"
              >
                <Plus className="size-4" /> Thêm lựa chọn
                <span className="text-xs text-muted-foreground">
                  ({g.values.length}/{PRODUCT_LIMITS.maxOptions})
                </span>
              </button>
            )}
          </div>
          {gi === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Ô vuông bên trái mỗi lựa chọn: ảnh riêng (ví dụ ảnh đúng màu), không bắt buộc.
            </p>
          )}
        </div>
      ))}
      {groups.length < PRODUCT_LIMITS.maxGroups && (
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-xl border-dashed border-champagne/60 text-navy sm:w-auto"
          onClick={onAddGroup}
        >
          <Plus /> Thêm nhóm phân loại {groups.length + 1}
        </Button>
      )}
    </div>
  );
}

type FormShape = { rows: Record<string, RowValues> };

/** Luật kiểm của ô giá/giá gốc/tồn (dùng cho cả bảng biến thể và sản phẩm không phân loại) */
export function rowRules(getValues: UseFormGetValues<FormShape>, key: string) {
  const L = PRODUCT_LIMITS;
  const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
  return {
    price: {
      validate: (v: number | null) => {
        if (v === null) return 'Vui lòng nhập giá.';
        if (v < L.priceMin || v > L.priceMax)
          return `Giá từ ${money(L.priceMin)} đến ${money(L.priceMax)}.`;
        return true;
      },
    },
    originalPrice: {
      validate: (v: number | null) => {
        if (v === null) return true;
        const price = getValues(`rows.${key}.price`);
        if (price !== null && v <= price) return 'Giá gốc phải lớn hơn giá bán.';
        if (v > L.priceMax) return `Giá gốc tối đa ${money(L.priceMax)}.`;
        return true;
      },
    },
    stock: {
      validate: (v: number | null) => {
        if (v === null) return 'Vui lòng nhập tồn kho.';
        if (v > L.stockMax) return `Tồn tối đa ${L.stockMax.toLocaleString('vi-VN')}.`;
        return true;
      },
    },
  };
}

/** Ô số trong bảng + câu lỗi nhỏ ngay dưới */
function CellInput({
  control,
  name,
  rules,
  suffix,
  placeholder,
  label,
  maxDigits,
  onAfterChange,
}: {
  control: Control<FormShape>;
  name: `rows.${string}.${keyof RowValues}`;
  rules: { validate: (v: number | null) => string | true };
  suffix?: string;
  placeholder?: string;
  label: string;
  maxDigits?: number;
  onAfterChange?: () => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      rules={rules}
      render={({ field, fieldState }) => (
        <div className="space-y-1">
          <NumberInput
            ref={field.ref}
            value={field.value}
            onChange={(v) => {
              field.onChange(v);
              onAfterChange?.();
            }}
            onBlur={field.onBlur}
            suffix={suffix}
            placeholder={placeholder}
            aria-label={label}
            aria-invalid={!!fieldState.error}
            maxDigits={maxDigits}
            inputClassName="h-9"
          />
          {fieldState.error && (
            <p className="text-[11px] leading-tight text-destructive">{fieldState.error.message}</p>
          )}
        </div>
      )}
    />
  );
}

/**
 * Bảng biến thể (tích các lựa chọn): giá, giá gốc, tồn ban đầu (biến thể mới) hoặc tồn hiện tại chỉ
 * đọc (biến thể đã có, đổi bằng "Điều chỉnh tồn"). Có thanh "Áp dụng cho tất cả" và nút bỏ tổ hợp.
 */
export function VariantTable({
  groups,
  rows,
  removedCount,
  existing,
  liveVariants,
  control,
  getValues,
  errors,
  highlight,
  onRemoveRow,
  onRestoreRows,
  onApplyAll,
  onAdjustStock,
  onRevalidate,
}: {
  groups: OptionGroup[];
  rows: RowSpec[];
  removedCount: number;
  /** Dòng nào là biến thể đã có (rowKey → id) */
  existing: Record<string, string>;
  /** Số tồn hiện tại của biến thể đã có (cập nhật sau khi điều chỉnh tồn) */
  liveVariants: Map<string, SellerVariant>;
  control: Control<FormShape>;
  getValues: UseFormGetValues<FormShape>;
  errors: FieldErrors<FormShape>;
  /** Dòng bị trùng tổ hợp (409 DUPLICATE_VARIANT) */
  highlight?: string | null;
  onRemoveRow: (key: string) => void;
  onRestoreRows: () => void;
  onApplyAll: (values: RowValues) => void;
  onAdjustStock?: (variantId: string) => void;
  onRevalidate: (key: string) => void;
}) {
  const [bulk, setBulk] = useState<RowValues>(emptyRow());
  const g1 = groups[0];
  const g2 = groups[1];
  // Gộp ô nhóm 1 (rowSpan) như Kênh người bán của các sàn lớn
  const spans = new Map<string, number>();
  rows.forEach((r) => spans.set(r.v1!.key, (spans.get(r.v1!.key) ?? 0) + 1));
  const firstOf = new Set<string>();
  const hasNew = rows.some((r) => !existing[r.key]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-xl border border-champagne/40 bg-champagne-50/50 p-3 md:flex-row md:items-center">
        <div className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-navy">
          <Wand2 className="size-4 text-champagne-600" /> Điền nhanh
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 md:grid-cols-3">
          <NumberInput
            value={bulk.price}
            onChange={(v) => setBulk((b) => ({ ...b, price: v }))}
            suffix="đ"
            placeholder="Giá bán"
            aria-label="Giá bán cho tất cả"
            inputClassName="h-9"
          />
          <NumberInput
            value={bulk.originalPrice}
            onChange={(v) => setBulk((b) => ({ ...b, originalPrice: v }))}
            suffix="đ"
            placeholder="Giá gốc"
            aria-label="Giá gốc cho tất cả"
            inputClassName="h-9"
          />
          {hasNew && (
            <NumberInput
              value={bulk.stock}
              onChange={(v) => setBulk((b) => ({ ...b, stock: v }))}
              placeholder="Tồn kho"
              aria-label="Tồn kho cho tất cả biến thể mới"
              maxDigits={6}
              inputClassName="h-9"
              className="col-span-2 md:col-span-1"
            />
          )}
        </div>
        <Button
          type="button"
          className="h-9 rounded-full px-4"
          disabled={bulk.price === null && bulk.originalPrice === null && bulk.stock === null}
          onClick={() => onApplyAll(bulk)}
        >
          Áp dụng cho tất cả
        </Button>
      </div>

      <p className="text-xs text-muted-foreground md:hidden">Vuốt ngang bảng để xem đủ các cột.</p>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="bg-ivory text-left text-xs tracking-wide text-muted-foreground uppercase">
              <th className="px-3 py-2.5 font-medium">{g1?.name || 'Nhóm 1'}</th>
              {g2 && <th className="px-3 py-2.5 font-medium">{g2.name || 'Nhóm 2'}</th>}
              <th className="w-40 px-3 py-2.5 font-medium">
                Giá bán<span className="text-destructive">*</span>
              </th>
              <th className="w-40 px-3 py-2.5 font-medium">Giá gốc</th>
              <th className="w-44 px-3 py-2.5 font-medium">Kho</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const id = existing[r.key];
              const live = id ? liveVariants.get(id) : undefined;
              const showV1 = !firstOf.has(r.v1!.key);
              firstOf.add(r.v1!.key);
              const rules = rowRules(getValues, r.key);
              return (
                <tr
                  key={r.key}
                  className={cn(
                    'border-t align-top',
                    highlight === r.key && 'bg-red-50/70',
                    errors.rows?.[r.key] && highlight !== r.key && 'bg-red-50/30',
                  )}
                >
                  {showV1 && (
                    <td
                      rowSpan={spans.get(r.v1!.key)}
                      className="border-r bg-white px-3 py-2.5 align-middle"
                    >
                      <div className="flex items-center gap-2">
                        {r.v1!.image ? (
                          <img
                            src={r.v1!.image}
                            alt=""
                            className="size-9 shrink-0 rounded-md border bg-white object-contain"
                          />
                        ) : null}
                        <span className="font-medium break-words text-ink">
                          {r.v1!.label || <span className="text-muted-foreground">(chưa đặt)</span>}
                        </span>
                      </div>
                    </td>
                  )}
                  {g2 && (
                    <td className="px-3 py-2.5 align-middle text-ink">
                      {r.v2?.label || <span className="text-muted-foreground">(chưa đặt)</span>}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <CellInput
                      control={control}
                      name={`rows.${r.key}.price`}
                      rules={rules.price}
                      suffix="đ"
                      placeholder="Giá"
                      label={`Giá bán ${r.v1!.label} ${r.v2?.label ?? ''}`}
                      onAfterChange={() => onRevalidate(r.key)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <CellInput
                      control={control}
                      name={`rows.${r.key}.originalPrice`}
                      rules={rules.originalPrice}
                      suffix="đ"
                      placeholder="Không bắt buộc"
                      label={`Giá gốc ${r.v1!.label} ${r.v2?.label ?? ''}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    {id ? (
                      <div className="flex min-h-9 items-center gap-2">
                        <div className="text-xs leading-tight whitespace-nowrap">
                          <div>
                            <b className="text-sm text-ink tabular-nums">{live?.stock ?? '—'}</b>{' '}
                            <span className="text-muted-foreground">tồn</span>
                          </div>
                          {!!live?.reserved && (
                            <div className="text-muted-foreground">giữ {live.reserved}</div>
                          )}
                        </div>
                        {onAdjustStock && (
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="ml-auto rounded-full border-champagne/60 text-navy"
                            onClick={() => onAdjustStock(id)}
                          >
                            <PackagePlus /> Điều chỉnh
                          </Button>
                        )}
                      </div>
                    ) : (
                      <CellInput
                        control={control}
                        name={`rows.${r.key}.stock`}
                        rules={rules.stock}
                        placeholder="Tồn ban đầu"
                        maxDigits={6}
                        label={`Tồn kho ${r.v1!.label} ${r.v2?.label ?? ''}`}
                      />
                    )}
                  </td>
                  <td className="py-2 pr-2 align-middle">
                    <button
                      type="button"
                      onClick={() => onRemoveRow(r.key)}
                      disabled={rows.length <= 1}
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-red-50 hover:text-red-600 disabled:pointer-events-none disabled:opacity-30"
                      aria-label="Bỏ tổ hợp này"
                      title="Bỏ tổ hợp này (không bán)"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1">
          <GripVertical className="size-3.5" /> {rows.length} biến thể. Biến thể đã có đổi tồn bằng
          nút "Điều chỉnh" (ghi lịch sử).
        </span>
        {removedCount > 0 && (
          <button
            type="button"
            onClick={onRestoreRows}
            className="inline-flex items-center gap-1 font-medium text-navy hover:underline"
          >
            <RotateCcw className="size-3.5" /> Khôi phục {removedCount} tổ hợp đã bỏ
          </button>
        )}
      </div>
    </div>
  );
}

/** Ô giá/giá gốc/tồn cho sản phẩm không phân loại */
export function SingleVariantFields({
  control,
  getValues,
  existingId,
  live,
  onAdjustStock,
  onRevalidate,
}: {
  control: Control<FormShape>;
  getValues: UseFormGetValues<FormShape>;
  existingId?: string;
  live?: SellerVariant;
  onAdjustStock?: (variantId: string) => void;
  onRevalidate: () => void;
}) {
  const rules = rowRules(getValues, SINGLE);
  const field = (
    name: keyof RowValues,
    label: string,
    required: boolean,
    suffix?: string,
    hint?: string,
  ) => (
    <Controller
      control={control}
      name={`rows.${SINGLE}.${name}`}
      rules={rules[name]}
      render={({ field: f, fieldState }) => (
        <div className="space-y-1.5">
          <label htmlFor={`single-${name}`} className="text-sm font-medium text-ink">
            {label}
            {required && <span className="text-destructive">*</span>}
          </label>
          <NumberInput
            id={`single-${name}`}
            ref={f.ref}
            value={f.value}
            onChange={(v) => {
              f.onChange(v);
              if (name === 'price') onRevalidate();
            }}
            onBlur={f.onBlur}
            suffix={suffix}
            maxDigits={name === 'stock' ? 6 : 10}
            aria-invalid={!!fieldState.error}
          />
          {fieldState.error ? (
            <p className="text-xs text-destructive">{fieldState.error.message}</p>
          ) : (
            hint && <p className="text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
      )}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {field('price', 'Giá bán', true, 'đ')}
      {field('originalPrice', 'Giá gốc', false, 'đ', 'Lớn hơn giá bán để hiện nhãn giảm giá.')}
      {existingId ? (
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-ink">Kho hàng</div>
          <div className="flex h-10 items-center gap-2 rounded-lg border bg-ivory px-3">
            <b className="text-ink tabular-nums">{live?.stock ?? '—'}</b>
            <span className="text-xs text-muted-foreground">
              tồn{live?.reserved ? ` · giữ ${live.reserved}` : ''}
            </span>
            {onAdjustStock && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="ml-auto rounded-full border-champagne/60 text-navy"
                onClick={() => onAdjustStock(existingId)}
              >
                <PackagePlus /> Điều chỉnh
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Mỗi lần điều chỉnh đều ghi lịch sử.</p>
        </div>
      ) : (
        field('stock', 'Tồn kho ban đầu', true, undefined, 'Số hàng đang có để bán.')
      )}
    </div>
  );
}
