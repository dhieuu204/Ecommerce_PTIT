import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Loader2 } from 'lucide-react';
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

/**
 * Chữ phân loại của dòng giỏ kèm nút "Đổi": mở khung chọn phân loại khác của cùng sản phẩm
 * (tải chi tiết sản phẩm khi mở lần đầu), xác nhận thì PATCH /cart/items/{id} với variantId.
 */
export function VariantSwitcher({
  item,
  onChange,
  pending,
}: {
  item: CartItem;
  onChange: (variantId: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const label = variantLabel(item, item);
  if (!label) return null;

  const canSwitch = item.state !== 'UNAVAILABLE';
  if (!canSwitch) return <div className="mt-1 text-xs text-ink/45">{label}</div>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg border border-ivory-200 bg-ivory/80 px-2.5 py-1 text-left text-xs text-ink/70 transition hover:border-champagne hover:text-navy data-[state=open]:border-champagne"
        >
          <span className="min-w-0">{label}</span>
          <span className="flex shrink-0 items-center gap-0.5 font-semibold text-navy">
            {pending ? <Loader2 className="size-3 animate-spin" /> : 'Đổi'}
            <ChevronDown className="size-3" />
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
  item: CartItem;
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
        <Loader2 className="size-4 animate-spin" /> Đang tải phân loại…
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
  item: CartItem;
  onCancel: () => void;
  onConfirm: (variantId: string) => void;
}) {
  const { variants } = product;
  const [sel, setSel] = useState<Selection>(() => initialSelection(variants, item.variantId));
  const variant = findVariant(variants, sel);
  const hasGroup2 = !!product.option2Name && variants.some((v) => v.option2Value);
  // Phân loại mới phải đủ hàng cho số lượng đang có trong giỏ (máy chủ cũng kiểm lại)
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
      <div className="flex items-center justify-between gap-3 border-t border-ivory-200 bg-ivory/60 px-4 py-3">
        <div className="min-w-0 text-sm">
          {variant ? (
            <>
              <div className="font-bold text-navy">{formatMoney(variant.price)}</div>
              <div className="text-xs text-ink/50">
                {variant.available > 0 ? `Còn ${variant.available}` : 'Hết hàng'}
              </div>
              {short && (
                <div className="mt-0.5 text-xs font-medium text-amber-700">
                  Giỏ đang có {item.quantity}, giảm còn {variant.available} rồi đổi.
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
                ? 'border-navy bg-navy text-white'
                : 'border-ivory-200 bg-card text-ink hover:border-champagne',
              c.disabled &&
                'cursor-not-allowed border-dashed bg-ivory text-ink/35 line-through hover:border-ivory-200',
            )}
          >
            {c.value}
          </button>
        ))}
      </div>
    </div>
  );
}
