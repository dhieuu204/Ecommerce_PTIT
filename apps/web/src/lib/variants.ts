/**
 * Chọn biến thể (phân loại hàng) của một sản phẩm: dùng ở trang sản phẩm và nút "Đổi" trong giỏ.
 * Quy tắc hiển thị:
 * - Nhóm 1 (ví dụ Màu): một lựa chọn chỉ bị khóa khi mọi tổ hợp của nó đều hết hàng.
 *   Bấm một lựa chọn nhóm 1 mà tổ hợp với nhóm 2 đang chọn không mua được thì nhóm 2 tự chuyển
 *   sang lựa chọn đầu tiên còn hàng.
 * - Nhóm 2 (ví dụ Dung lượng): xét theo lựa chọn nhóm 1 đang chọn; tổ hợp không có hoặc hết hàng thì khóa.
 */
import type { ProductDetail } from './catalog-types';

export type Variant = ProductDetail['variants'][number];

export interface Selection {
  o1: string | null;
  o2: string | null;
}

/** Thông tin hiển thị một lựa chọn */
export interface OptionChoice {
  value: string;
  /** Giá thấp nhất của lựa chọn này (ưu tiên các tổ hợp còn hàng) */
  price: number | null;
  /** Không bấm được: hết hàng hoặc tổ hợp không có */
  disabled: boolean;
}

/** Các lựa chọn của một nhóm, giữ thứ tự xuất hiện trong danh sách biến thể */
export function optionValues(variants: Variant[], group: 1 | 2): string[] {
  const seen = new Set<string>();
  for (const v of variants) {
    const value = group === 1 ? v.option1Value : v.option2Value;
    if (value) seen.add(value);
  }
  return [...seen];
}

const same = (a: string | null, b: string | null) => (a ?? null) === (b ?? null);

/** Biến thể đúng tổ hợp đang chọn (null nếu tổ hợp không có) */
export function findVariant(variants: Variant[], sel: Selection): Variant | null {
  return variants.find((v) => same(v.option1Value, sel.o1) && same(v.option2Value, sel.o2)) ?? null;
}

/** Lựa chọn ban đầu: tổ hợp còn hàng đầu tiên, nếu tất cả đã hết thì biến thể đầu tiên */
export function initialSelection(variants: Variant[], preferredId?: string): Selection {
  const v =
    (preferredId && variants.find((x) => x.id === preferredId)) ||
    variants.find((x) => x.available > 0) ||
    variants[0];
  return { o1: v?.option1Value ?? null, o2: v?.option2Value ?? null };
}

function minPrice(list: Variant[]): number | null {
  if (list.length === 0) return null;
  const pool = list.some((v) => v.available > 0) ? list.filter((v) => v.available > 0) : list;
  return Math.min(...pool.map((v) => v.price));
}

/** Các lựa chọn nhóm 1 kèm giá thấp nhất và trạng thái khóa (khóa khi mọi tổ hợp đều hết hàng) */
export function group1Choices(variants: Variant[]) {
  return optionValues(variants, 1).map<OptionChoice>((value) => {
    const list = variants.filter((v) => v.option1Value === value);
    return { value, price: minPrice(list), disabled: !list.some((v) => v.available > 0) };
  });
}

/** Các lựa chọn nhóm 2, xét theo lựa chọn nhóm 1 đang chọn */
export function group2Choices(variants: Variant[], sel: Selection) {
  return optionValues(variants, 2).map<OptionChoice>((value) => {
    const v = variants.find((x) => same(x.option1Value, sel.o1) && x.option2Value === value);
    return { value, price: v?.price ?? null, disabled: !v || v.available <= 0 };
  });
}

/** Bấm một lựa chọn nhóm 1: giữ nhóm 2 nếu tổ hợp mua được, không thì chuyển sang lựa chọn còn hàng */
export function pickGroup1(variants: Variant[], sel: Selection, value: string): Selection {
  const keep = findVariant(variants, { o1: value, o2: sel.o2 });
  if (keep && keep.available > 0) return { o1: value, o2: sel.o2 };
  const first =
    variants.find((v) => v.option1Value === value && v.available > 0) ??
    variants.find((v) => v.option1Value === value);
  return { o1: value, o2: first?.option2Value ?? null };
}

/** Chữ mô tả phân loại: "Màu sắc: Đen, Dung lượng: 256GB" */
export function variantLabel(
  names: { option1Name: string | null; option2Name: string | null },
  values: { option1Value: string | null; option2Value: string | null },
): string {
  const parts: string[] = [];
  if (values.option1Value) parts.push(`${names.option1Name ?? 'Loại'}: ${values.option1Value}`);
  if (values.option2Value) parts.push(`${names.option2Name ?? 'Loại'}: ${values.option2Value}`);
  return parts.join(', ');
}
