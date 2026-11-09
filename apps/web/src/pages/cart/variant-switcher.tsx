import { useQuery } from '@tanstack/react-query';
import { IconChevronDown, IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { API, api } from '@/lib/api';
import type { CartItem, ProductDetail } from '@/lib/catalog-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type Selection,
  findVariant,
  group1Choices,
  group2Choices,
  initialSelection,
  pickGroup1,
  variantLabel,
} from '@/lib/variants';

/** Thông tin tối thiểu của dòng hàng để đổi phân loại (dùng ở giỏ hàng và trang đặt hàng) */
type SwitchLine = Pick<CartItem, 'productId' | 'variantId' | 'quantity'>;

/** Đổi phân loại ở giỏ hàng: tính chữ hiển thị từ dòng giỏ rồi dùng VariantPopover */
export function VariantSwitcher({
  item,
  onChange,
  pending,
}: {
  item: CartItem;
  onChange: (variantId: string) => void;
  pending: boolean;
}) {
  const label = variantLabel(item, item);
  // Chữ gọn trên chip: chỉ giá trị ("Xanh Dương · 256GB"), tên nhóm đầy đủ hiện khi rê chuột
  const short = [item.option1Value, item.option2Value].filter(Boolean).join(' · ');
  if (!label) return null;

  const canSwitch = item.state !== 'UNAVAILABLE';
  if (!canSwitch) return <div className="mt-1 text-xs text-ink/45">{short || label}</div>;

  return (
    <VariantPopover
      item={item}
      label={label}
      short={short || label}
      pending={pending}
      onChange={onChange}
    />
  );
}

/**
 * Chữ phân loại kèm nút "Đổi": mở khung chọn phân loại khác của cùng sản phẩm (tải chi tiết sản phẩm khi mở
 * lần đầu). Việc lưu do nơi dùng làm trong onChange.
 */
export function VariantPopover({
  item,
  label,
  short,
  pending,
  disabled,
  onChange,
}: {
  item: SwitchLine;
  label: string;
  short: string;
  pending: boolean;
  disabled?: boolean;
  onChange: (variantId: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={label}
          disabled={disabled}
          className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-md bg-page px-2.5 py-1 text-left text-xs text-ink/65 ring-1 ring-ink/[0.08] transition hover:text-navy hover:ring-navy/30 data-[state=open]:ring-navy/40"
        >
          <span className="min-w-0 truncate">{short}</span>
          <span className="flex shrink-0 items-center gap-0.5 font-semibold text-navy">
            {pending ? <IconLoader2 className="size-3 animate-spin" /> : 'Đổi'}
            <IconChevronDown className="size-3" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        {open && (
          <SwitcherBody
            item={item}
            onCancel={() => setOpen(false)}
            onConfirm={(variantId) => {
              setOpen(false);
              if (variantId !== item.variantId) onChange(variantId);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function SwitcherBody({
  item,
  onCancel,
  onConfirm,
}: {
  item: SwitchLine;
  onCancel: () => void;
  onConfirm: (variantId: string) => void;
}) {
  const product = useQuery({
    queryKey: ['product', item.productId],
    queryFn: () => api<ProductDetail>(`${API.market}/products/${item.productId}`),
    staleTime: 30_000,
  });

  if (product.isPending) {
    return (
      <div className="flex items-center justify-center gap-2 p-8 text-sm text-ink/55">
        <IconLoader2 className="size-4 animate-spin" /> Đang tải phân loại…
      </div>
    );
  }
  if (product.isError) {
    return <div className="p-5 text-sm text-ink/60">{product.error.message}</div>;
  }
  return (
    <Picker
      key={product.data.id}
      product={product.data}
      item={item}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function Picker({
  product,
  item,
  onCancel,
  onConfirm,
}: {
  product: ProductDetail;
  item: SwitchLine;
  onCancel: () => void;
  onConfirm: (variantId: string) => void;
}) {
  const { variants } = product;
  const [sel, setSel] = useState<Selection>(() => initialSelection(variants, item.variantId));
  const variant = findVariant(variants, sel);
  const hasGroup2 = !!product.option2Name && variants.some((v) => v.option2Value);
  // Phân loại mới phải đủ hàng cho số lượng đang chọn (máy chủ cũng kiểm lại)
  const short =
    !!variant &&
    variant.id !== item.variantId &&
    variant.available > 0 &&
    variant.available < item.quantity;
  const ok = !!variant && variant.available > 0 && !short;

  return (
    <div>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto p-4">
        {product.option1Name && (
          <ChipGroup
            label={product.option1Name}
            choices={group1Choices(variants)}
            value={sel.o1}
            onPick={(v) => setSel(pickGroup1(variants, sel, v))}
          />
        )}
        {hasGroup2 && (
          <ChipGroup
            label={product.option2Name!}
            choices={group2Choices(variants, sel)}
            value={sel.o2}
            onPick={(v) => setSel({ o1: sel.o1, o2: v })}
          />
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-ink/[0.07] bg-page px-4 py-3">
        <div className="min-w-0 text-sm">
          {variant ? (
            <>
              <div className="font-bold text-navy">{formatMoney(variant.price)}</div>
              <div className="text-xs text-ink/50">
                {variant.available > 0 ? `Còn ${variant.available}` : 'Hết hàng'}
              </div>
              {short && (
                <div className="mt-0.5 text-xs font-medium text-champagne-600">
                  Đang chọn {item.quantity}, giảm còn {variant.available} rồi đổi.
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-ink/50">Chưa có phân loại này</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Hủy
          </Button>
          <Button size="sm" disabled={!ok} onClick={() => variant && onConfirm(variant.id)}>
            Xác nhận
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChipGroup({
  label,
  choices,
  value,
  onPick,
}: {
  label: string;
  choices: ReturnType<typeof group1Choices>;
  value: string | null;
  onPick: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink/50">{label}</div>
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <button
            key={c.value}
            type="button"
            disabled={c.disabled}
            aria-pressed={c.value === value}
            onClick={() => onPick(c.value)}
            className={cn(
              'rounded-lg border px-3 py-1.5 text-sm transition',
              c.value === value
                ? 'border-navy bg-champagne-50 font-semibold text-navy'
                : 'border-ink/15 bg-card text-charcoal hover:border-navy/50',
              c.disabled && 'cursor-not-allowed opacity-40 hover:border-ink/15',
            )}
          >
            {c.value}
          </button>
        ))}
      </div>
    </div>
  );
}
