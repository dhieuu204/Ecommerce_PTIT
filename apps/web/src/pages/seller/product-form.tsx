import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Circle,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  PackageSearch,
  PackagePlus,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Controller, useForm, type Control, type UseFormGetValues } from 'react-hook-form';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { CategoryIcon } from '@/components/category-icon';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { FormField, inputClass, SectionCard } from '@/components/console/form-field';
import { NumberInput } from '@/components/console/money-input';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCategories } from '@/hooks/use-catalog';
import { useMyShop } from '@/hooks/use-my-shop';
import { API, api, ApiError } from '@/lib/api';
import type { CategoryNode, ProductInput, SellerProduct, SellerVariant } from '@/lib/catalog-types';
import { showApiError } from '@/lib/form';
import { PRODUCT_LIMITS } from '@/lib/product-limits';
import { cn } from '@/lib/utils';
import { ImageGallery } from './product-images';
import {
  productPath,
  ProductStatusBadge,
  SELLER_PRODUCTS_KEY,
  sellerProductKey,
  useSellerProduct,
} from './product-shared';
import {
  buildRows,
  emptyRow,
  newKey,
  rowKey,
  SINGLE,
  SingleVariantFields,
  VariantGroupsEditor,
  VariantTable,
  type OptionGroup,
  type RowValues,
  type StructErrors,
} from './product-variants';
import { StockAdjustDialog, StockHistoryList } from './stock-dialogs';

interface FormValues {
  name: string;
  description: string;
  categoryId: string;
  weight: number | null;
  rows: Record<string, RowValues>;
}
type RowsShape = { rows: Record<string, RowValues> };

/** Trạng thái ban đầu của form (tạo mới hoặc từ sản phẩm đang sửa) */
interface Initial {
  values: FormValues;
  hasVariants: boolean;
  groups: OptionGroup[];
  images: string[];
  removed: string[];
  /** rowKey → id biến thể đã có */
  existing: Record<string, string>;
}

function initialFrom(p?: SellerProduct): Initial {
  if (!p) {
    return {
      values: {
        name: '',
        description: '',
        categoryId: '',
        weight: null,
        rows: { [SINGLE]: emptyRow() },
      },
      hasVariants: false,
      groups: [],
      images: [],
      removed: [],
      existing: {},
    };
  }
  const rows: Record<string, RowValues> = {};
  const existing: Record<string, string> = {};
  const groups: OptionGroup[] = [];
  const valueImage = (label: string) => p.images.find((i) => i.option1Value === label)?.url ?? null;
  const distinct = (pick: (v: SellerVariant) => string | null) => [
    ...new Set(p.variants.map(pick).filter((x): x is string => !!x)),
  ];

  if (p.option1Name) {
    groups.push({
      key: newKey(),
      name: p.option1Name,
      values: distinct((v) => v.option1Value).map((label) => ({
        key: newKey(),
        label,
        image: valueImage(label),
      })),
    });
    if (p.option2Name) {
      groups.push({
        key: newKey(),
        name: p.option2Name,
        values: distinct((v) => v.option2Value).map((label) => ({
          key: newKey(),
          label,
          image: null,
        })),
      });
    }
    for (const v of p.variants) {
      const k1 = groups[0]!.values.find((x) => x.label === v.option1Value)!.key;
      const k2 = groups[1]?.values.find((x) => x.label === v.option2Value)?.key ?? null;
      const key = rowKey(k1, k2);
      rows[key] = { price: v.price, originalPrice: v.originalPrice, stock: null };
      existing[key] = v.id;
    }
  } else if (p.variants[0]) {
    const v = p.variants[0];
    rows[SINGLE] = { price: v.price, originalPrice: v.originalPrice, stock: null };
    existing[SINGLE] = v.id;
  }
  rows[SINGLE] ??= emptyRow();
  // Tổ hợp không có trong sản phẩm = seller đã bỏ
  const removed = buildRows(groups, [])
    .map((r) => r.key)
    .filter((k) => !existing[k]);

  return {
    values: {
      name: p.name,
      description: p.description,
      categoryId: p.categoryId,
      weight: p.weight,
      rows,
    },
    hasVariants: !!p.option1Name,
    groups,
    images: p.images.filter((i) => i.option1Value === null).map((i) => i.url),
    removed,
    existing,
  };
}

/**
 * Kênh người bán › Thêm / sửa sản phẩm (CAT-02, CAT-03): ảnh, tên, danh mục, mô tả; phân loại
 * (2 nhóm × 10 lựa chọn) sinh bảng biến thể; khối lượng. Một component cho cả hai đường dẫn.
 */
export function ProductFormPage() {
  const { productId } = useParams();
  const product = useSellerProduct(productId);
  // Bản dùng để dựng form: chỉ thay khi mở trang hoặc vừa lưu (ẩn/hiện, điều chỉnh tồn không làm mất chữ đang gõ)
  const [snapshot, setSnapshot] = useState<{ data: SellerProduct; version: number } | null>(null);
  if (productId && product.data && (!snapshot || snapshot.data.id !== product.data.id)) {
    setSnapshot({ data: product.data, version: (snapshot?.version ?? 0) + 1 });
  }

  if (!productId) return <ProductEditor key="new" />;
  if (product.isPending) return <FormSkeleton />;
  if (product.isError) {
    if (product.error instanceof ApiError && product.error.status === 404) {
      return (
        <EmptyState
          icon={PackageSearch}
          title="Không tìm thấy sản phẩm"
          text="Sản phẩm không có hoặc không thuộc shop của bạn."
          action={
            <Button asChild variant="outline">
              <Link to="/kenh-nguoi-ban/san-pham">Về danh sách sản phẩm</Link>
            </Button>
          }
        />
      );
    }
    return <LoadError message={product.error.message} onRetry={() => void product.refetch()} />;
  }
  if (!snapshot) return <FormSkeleton />;
  return (
    <ProductEditor
      key={`${snapshot.data.id}-${snapshot.version}`}
      initialProduct={snapshot.data}
      live={product.data}
      onSaved={(p) => setSnapshot((s) => ({ data: p, version: (s?.version ?? 0) + 1 }))}
    />
  );
}

function ProductEditor({
  initialProduct,
  live,
  onSaved,
}: {
  initialProduct?: SellerProduct;
  /** Dữ liệu mới nhất (trạng thái, tồn) */
  live?: SellerProduct;
  onSaved?: (p: SellerProduct) => void;
}) {
  const isEdit = !!initialProduct;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const categories = useCategories();
  const shop = useMyShop();
  const init = useMemo(() => initialFrom(initialProduct), [initialProduct]);

  const form = useForm<FormValues>({ defaultValues: init.values, mode: 'onTouched' });
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    getValues,
    setError,
    trigger,
    clearErrors,
    formState: { errors, isSubmitting, isDirty },
  } = form;
  const rowsControl = control as unknown as Control<RowsShape>;
  const rowsGetValues = getValues as unknown as UseFormGetValues<RowsShape>;

  const [hasVariants, setHasVariants] = useState(init.hasVariants);
  const [groups, setGroups] = useState(init.groups);
  const [images, setImages] = useState(init.images);
  const [removed, setRemoved] = useState(init.removed);
  const [existing, setExisting] = useState(init.existing);
  const [structErrors, setStructErrors] = useState<StructErrors>({});
  const [highlight, setHighlight] = useState<string | null>(null);
  const [structDirty, setStructDirty] = useState(false);
  const [stockVariant, setStockVariant] = useState<string | null>(null);
  const variantsRef = useRef<HTMLDivElement>(null);
  const imagesRef = useRef<HTMLDivElement>(null);

  const rows = hasVariants ? buildRows(groups, removed) : [];
  const liveVariants = useMemo(() => new Map((live?.variants ?? []).map((v) => [v.id, v])), [live]);
  const name = watch('name');
  const description = watch('description');
  const categoryId = watch('categoryId');

  const touch = () => setStructDirty(true);
  const clearStruct = (...keys: string[]) =>
    setStructErrors((e) => {
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });

  /** Chép giá/tồn và mã biến thể đã có từ dòng cũ sang dòng mới (khi thêm/bớt nhóm 2) */
  function remap(pairs: Array<[from: string, to: string]>) {
    const ex = { ...existing };
    for (const [from, to] of pairs) {
      const v = getValues(`rows.${from}`);
      if (v) setValue(`rows.${to}`, { ...v });
      if (ex[from]) {
        ex[to] = ex[from]!;
        delete ex[from];
      }
    }
    setExisting(ex);
  }

  // ----- Thao tác trên nhóm phân loại -----
  const updateGroup = (gi: number, fn: (g: OptionGroup) => OptionGroup) => {
    setGroups((gs) => gs.map((g, i) => (i === gi ? fn(g) : g)));
    touch();
  };
  const newValue = () => ({ key: newKey(), label: '', image: null });

  function toggleVariants(on: boolean) {
    setHasVariants(on);
    touch();
    clearStruct('variants');
    if (on && groups.length === 0) {
      setGroups([{ key: newKey(), name: '', values: [newValue()] }]);
    }
  }
  function addGroup() {
    if (groups.length === 0) {
      setGroups([{ key: newKey(), name: '', values: [newValue()] }]);
      touch();
      return;
    }
    const first = newValue();
    // Dòng "Đen" thành "Đen / <lựa chọn đầu của nhóm 2>"
    remap(groups[0]!.values.map((a) => [rowKey(a.key, null), rowKey(a.key, first.key)]));
    setGroups((gs) => [...gs, { key: newKey(), name: '', values: [first] }]);
    touch();
  }
  function removeGroup(gi: number) {
    touch();
    clearStruct(`group.${gi}.name`, 'group.1.name');
    if (groups.length === 1) {
      // Bỏ hết phân loại: dòng đầu thành sản phẩm không phân loại
      const firstRow = rows[0];
      if (firstRow && !existing[SINGLE]) remap([[firstRow.key, SINGLE]]);
      setGroups([]);
      setHasVariants(false);
      setRemoved([]);
      return;
    }
    const [g1, g2] = groups as [OptionGroup, OptionGroup];
    if (gi === 1) {
      const b = g2.values[0]!;
      remap(g1.values.map((a) => [rowKey(a.key, b.key), rowKey(a.key, null)]));
      setGroups([g1]);
    } else {
      // Bỏ nhóm 1: nhóm 2 lên làm nhóm 1
      const a = g1.values[0]!;
      remap(g2.values.map((b) => [rowKey(a.key, b.key), rowKey(b.key, null)]));
      setGroups([g2]);
    }
    setRemoved([]);
  }
  function addValue(gi: number) {
    const v = newValue();
    updateGroup(gi, (g) => ({ ...g, values: [...g.values, v] }));
    // Đưa con trỏ vào ô vừa thêm
    setTimeout(() =>
      document.querySelector<HTMLInputElement>(`[data-value-key="${v.key}"]`)?.focus(),
    );
  }
  function removeValue(gi: number, key: string) {
    updateGroup(gi, (g) => ({ ...g, values: g.values.filter((v) => v.key !== key) }));
    clearStruct(`value.${key}`, `image.${key}`);
  }

  function applyAll(bulk: RowValues) {
    for (const r of rows) {
      if (bulk.price !== null) setValue(`rows.${r.key}.price`, bulk.price, { shouldDirty: true });
      if (bulk.originalPrice !== null)
        setValue(`rows.${r.key}.originalPrice`, bulk.originalPrice, { shouldDirty: true });
      if (bulk.stock !== null && !existing[r.key])
        setValue(`rows.${r.key}.stock`, bulk.stock, { shouldDirty: true });
    }
    if (errors.rows) void trigger('rows');
    toast.success(`Đã điền cho ${rows.length} biến thể.`);
  }

  /** Kiểm phần không nằm trong react-hook-form: ảnh, nhóm, lựa chọn */
  function validateStruct(): StructErrors {
    const e: StructErrors = {};
    if (images.length === 0) e.images = 'Cần ít nhất 1 ảnh sản phẩm.';
    if (hasVariants) {
      groups.forEach((g, gi) => {
        if (!g.name.trim()) e[`group.${gi}.name`] = 'Vui lòng nhập tên nhóm phân loại.';
        const seen = new Set<string>();
        g.values.forEach((v) => {
          const l = v.label.trim().toLowerCase();
          if (!l) e[`value.${v.key}`] = 'Vui lòng nhập lựa chọn.';
          else if (seen.has(l)) e[`value.${v.key}`] = 'Lựa chọn bị trùng trong nhóm.';
          seen.add(l);
        });
      });
      if (
        groups.length === 2 &&
        groups[0]!.name.trim() &&
        groups[0]!.name.trim().toLowerCase() === groups[1]!.name.trim().toLowerCase()
      )
        e['group.1.name'] = 'Hai nhóm phân loại phải khác tên.';
      if (groups.length === 0 || rows.length === 0) e.variants = 'Cần ít nhất 1 biến thể.';
    }
    return e;
  }

  function showStruct(e: StructErrors): boolean {
    setStructErrors(e);
    if (Object.keys(e).length === 0) return false;
    if (e.images) imagesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    else variantsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  async function onValid(values: FormValues) {
    if (showStruct(validateStruct())) return;
    setHighlight(null);

    // Gửi: thứ tự biến thể/ảnh để đổi lỗi `variants.2.price` về đúng ô
    const sentRows = hasVariants ? rows.map((r) => r.key) : [SINGLE];
    const g1 = hasVariants ? groups[0] : undefined;
    const g2 = hasVariants ? groups[1] : undefined;
    const variants: ProductInput['variants'] = sentRows.map((key) => {
      const spec = rows.find((r) => r.key === key);
      const v = values.rows[key] ?? emptyRow();
      const id = existing[key];
      return {
        ...(id ? { id } : {}),
        option1Value: spec?.v1?.label.trim() ?? null,
        option2Value: spec?.v2?.label.trim() ?? null,
        price: v.price!,
        originalPrice: v.originalPrice,
        ...(id ? {} : { stock: v.stock ?? 0 }),
      };
    });
    const valueImages = (g1?.values ?? []).filter((v) => v.image);
    const sentImages: Array<{ kind: 'general'; i: number } | { kind: 'value'; key: string }> = [
      ...images.map((_, i) => ({ kind: 'general' as const, i })),
      ...valueImages.map((v) => ({ kind: 'value' as const, key: v.key })),
    ];
    const body: ProductInput = {
      name: values.name.trim(),
      description: values.description.trim(),
      categoryId: values.categoryId,
      weight: values.weight!,
      option1Name: g1?.name.trim() ?? null,
      option2Name: g2?.name.trim() ?? null,
      variants,
      images: [
        ...images.map((url) => ({ url, option1Value: null })),
        ...valueImages.map((v) => ({ url: v.image!, option1Value: v.label.trim() })),
      ],
    };

    try {
      const saved = await api<SellerProduct>(
        isEdit ? productPath(initialProduct.id) : `${API.market}/shops/me/products`,
        { method: isEdit ? 'PUT' : 'POST', body },
      );
      queryClient.setQueryData(sellerProductKey(saved.id), saved);
      void queryClient.invalidateQueries({ queryKey: SELLER_PRODUCTS_KEY });
      if (isEdit) {
        toast.success('Đã lưu thay đổi sản phẩm.');
        onSaved?.(saved);
      } else {
        toast.success(
          shop.data?.status === 'SUSPENDED'
            ? 'Đã tạo sản phẩm. Hàng sẽ hiện trên sàn khi shop được khôi phục.'
            : 'Đã đăng sản phẩm, hàng đã lên sàn.',
        );
        navigate('/kenh-nguoi-ban/san-pham');
      }
    } catch (e) {
      handleSaveError(e, sentRows, sentImages);
    }
  }

  function handleSaveError(
    e: unknown,
    sentRows: string[],
    sentImages: Array<{ kind: 'general'; i: number } | { kind: 'value'; key: string }>,
  ) {
    if (!(e instanceof ApiError)) {
      showApiError(e);
      return;
    }
    const struct: StructErrors = {};
    const index = typeof e.details.index === 'number' ? e.details.index : -1;
    switch (e.code) {
      case 'VALIDATION_ERROR': {
        let mapped = 0;
        for (const [field, message] of Object.entries(e.fields)) {
          const m = /^variants\.(\d+)\.(\w+)$/.exec(field);
          const im = /^images\.(\d+)\.(\w+)$/.exec(field);
          if (m) {
            const key = sentRows[Number(m[1])];
            const spec = rows.find((r) => r.key === key);
            const f = m[2]!;
            if (key && (f === 'price' || f === 'originalPrice' || f === 'stock')) {
              setError(`rows.${key}.${f}`, { type: 'server', message });
            } else if (f === 'option1Value' && spec?.v1) struct[`value.${spec.v1.key}`] = message;
            else if (f === 'option2Value' && spec?.v2) struct[`value.${spec.v2.key}`] = message;
            else struct.variants = message;
            mapped++;
          } else if (im) {
            const target = sentImages[Number(im[1])];
            if (target?.kind === 'value') struct[`image.${target.key}`] = message;
            else struct.images = message;
            mapped++;
          } else if (field === 'option1Name') {
            struct['group.0.name'] = message;
            mapped++;
          } else if (field === 'option2Name') {
            struct['group.1.name'] = message;
            mapped++;
          } else if (field === 'images' || field === 'variants') {
            struct[field] = message;
            mapped++;
          } else if (['name', 'description', 'categoryId', 'weight'].includes(field)) {
            setError(field as 'name', { type: 'server', message }, { shouldFocus: true });
            mapped++;
          }
        }
        if (!mapped) toast.error(e.message);
        else toast.error('Có ô chưa hợp lệ, bạn xem các chỗ tô đỏ.');
        break;
      }
      case 'DUPLICATE_VARIANT':
        struct.variants = e.message;
        if (index >= 0) setHighlight(sentRows[index] ?? null);
        break;
      case 'VARIANT_RESERVED':
        struct.variants = `${e.message} Bấm "Khôi phục" để giữ lại tổ hợp đó.`;
        break;
      case 'INVALID_IMAGE_URL': {
        const target = sentImages[index];
        if (target?.kind === 'value') struct[`image.${target.key}`] = e.message;
        else struct.images = e.message;
        break;
      }
      case 'INVALID_CATEGORY':
        setError('categoryId', { type: 'server', message: e.message });
        document
          .getElementById('category-picker')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      default:
        showApiError(e, setError);
        return;
    }
    if (Object.keys(struct).length) showStruct(struct);
  }

  const dirty = isDirty || structDirty;
  const errorCount =
    Object.keys(errors).length + Object.values(structErrors).filter(Boolean).length;
  const status = live?.status ?? initialProduct?.status;
  const tips = [
    { ok: images.length >= 3, text: 'Thêm ít nhất 3 ảnh' },
    { ok: name.trim().length >= 25, text: 'Tên sản phẩm có 25–120 ký tự' },
    { ok: !!categoryId, text: 'Chọn danh mục' },
    { ok: description.trim().length >= 100, text: 'Mô tả có ít nhất 100 ký tự' },
    ...(hasVariants
      ? [{ ok: groups.some((g) => g.values.some((v) => v.image)), text: 'Ảnh cho từng phân loại' }]
      : []),
  ];

  return (
    <form
      onSubmit={handleSubmit(onValid, () => showStruct(validateStruct()))}
      noValidate
      className="mx-auto max-w-6xl"
    >
      <PageHeader
        crumbs={[
          { label: 'Sản phẩm', to: '/kenh-nguoi-ban/san-pham' },
          { label: isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm' },
        ]}
        title={isEdit ? 'Sửa sản phẩm' : 'Thêm sản phẩm mới'}
        description={
          isEdit
            ? 'Sửa xong bấm Lưu. Tồn kho của biến thể đã có đổi bằng nút Điều chỉnh.'
            : 'Điền đủ các mục có dấu *. Đăng xong là hàng lên sàn ngay.'
        }
        actions={
          isEdit &&
          live && <EditActions product={live} shopActive={shop.data?.status === 'ACTIVE'} />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_260px]">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Thông tin cơ bản">
            <div className="space-y-6">
              <div ref={imagesRef} className="scroll-mt-24">
                <div className="mb-2 text-sm font-medium text-ink">
                  Hình ảnh sản phẩm<span className="text-destructive">*</span>
                </div>
                <ImageGallery
                  images={images}
                  setImages={setImages}
                  error={structErrors.images}
                  onChanged={() => {
                    touch();
                    clearStruct('images');
                  }}
                />
              </div>

              <FormField
                label="Tên sản phẩm"
                htmlFor="name"
                required
                error={errors.name?.message}
                hint={
                  <span className="flex justify-between gap-2">
                    <span>Gồm thương hiệu, tên dòng, đặc điểm chính.</span>
                    <span className="tabular-nums">
                      {name.trim().length}/{PRODUCT_LIMITS.nameMax}
                    </span>
                  </span>
                }
              >
                <Input
                  id="name"
                  maxLength={PRODUCT_LIMITS.nameMax}
                  placeholder="Ví dụ: Ốp lưng silicon MagSafe cho iPhone 16"
                  className={inputClass}
                  aria-invalid={!!errors.name}
                  {...register('name', {
                    validate: (v) => {
                      const n = v.trim().length;
                      if (!n) return 'Vui lòng nhập tên sản phẩm.';
                      if (n < PRODUCT_LIMITS.nameMin || n > PRODUCT_LIMITS.nameMax)
                        return `Tên sản phẩm từ ${PRODUCT_LIMITS.nameMin} đến ${PRODUCT_LIMITS.nameMax} ký tự.`;
                      return true;
                    },
                  })}
                />
              </FormField>

              <div id="category-picker" className="scroll-mt-24">
                <Controller
                  control={control}
                  name="categoryId"
                  rules={{ required: 'Vui lòng chọn danh mục.' }}
                  render={({ field, fieldState }) => (
                    <CategoryPicker
                      tree={categories.data}
                      loading={categories.isPending}
                      value={field.value}
                      onChange={field.onChange}
                      fallback={initialProduct?.category}
                      error={fieldState.error?.message}
                    />
                  )}
                />
              </div>

              <FormField
                label="Mô tả sản phẩm"
                htmlFor="description"
                required
                error={errors.description?.message}
                hint={
                  <span className="flex justify-between gap-2">
                    <span>Chất liệu, kích thước, bảo hành, đổi trả… Xuống dòng để tách ý.</span>
                    <span className="tabular-nums">
                      {description.trim().length}/{PRODUCT_LIMITS.descriptionMax}
                    </span>
                  </span>
                }
              >
                <Textarea
                  id="description"
                  rows={7}
                  maxLength={PRODUCT_LIMITS.descriptionMax}
                  className="rounded-lg bg-white focus-visible:border-champagne"
                  aria-invalid={!!errors.description}
                  {...register('description', {
                    validate: (v) => {
                      const n = v.trim().length;
                      if (!n) return 'Vui lòng nhập mô tả.';
                      if (n < PRODUCT_LIMITS.descriptionMin)
                        return `Mô tả ít nhất ${PRODUCT_LIMITS.descriptionMin} ký tự (đang có ${n}).`;
                      if (n > PRODUCT_LIMITS.descriptionMax)
                        return `Mô tả tối đa ${PRODUCT_LIMITS.descriptionMax} ký tự.`;
                      return true;
                    },
                  })}
                />
              </FormField>
            </div>
          </SectionCard>

          <div ref={variantsRef} className="scroll-mt-20">
            <SectionCard
              title="Thông tin bán hàng"
              description="Giá, phân loại hàng và tồn kho."
              actions={
                <label className="flex cursor-pointer items-center gap-2.5 rounded-full border bg-ivory px-3 py-1.5 text-sm">
                  <Switch checked={hasVariants} onCheckedChange={toggleVariants} />
                  <span className="font-medium text-navy">Có phân loại hàng</span>
                </label>
              }
            >
              {structErrors.variants && (
                <div
                  role="alert"
                  className="mb-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
                >
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  {structErrors.variants}
                </div>
              )}
              {hasVariants ? (
                <div className="space-y-6">
                  <VariantGroupsEditor
                    groups={groups}
                    errors={structErrors}
                    onRename={(gi, v) => {
                      updateGroup(gi, (g) => ({ ...g, name: v }));
                      clearStruct(`group.${gi}.name`);
                    }}
                    onAddValue={addValue}
                    onRemoveValue={removeValue}
                    onRenameValue={(gi, key, label) => {
                      updateGroup(gi, (g) => ({
                        ...g,
                        values: g.values.map((v) => (v.key === key ? { ...v, label } : v)),
                      }));
                      clearStruct(`value.${key}`);
                    }}
                    onValueImage={(key, url) => {
                      updateGroup(0, (g) => ({
                        ...g,
                        values: g.values.map((v) => (v.key === key ? { ...v, image: url } : v)),
                      }));
                      clearStruct(`image.${key}`);
                    }}
                    onAddGroup={addGroup}
                    onRemoveGroup={removeGroup}
                  />
                  {groups.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy">
                        Danh sách phân loại hàng
                      </div>
                      <VariantTable
                        groups={groups}
                        rows={rows}
                        removedCount={
                          removed.filter((k) => buildRows(groups, []).some((r) => r.key === k))
                            .length
                        }
                        existing={existing}
                        liveVariants={liveVariants}
                        control={rowsControl}
                        getValues={rowsGetValues}
                        errors={errors}
                        highlight={highlight}
                        onRemoveRow={(key) => {
                          setRemoved((r) => [...r, key]);
                          touch();
                          clearErrors(`rows.${key}`);
                          if (
                            existing[key] &&
                            (liveVariants.get(existing[key]!)?.reserved ?? 0) > 0
                          ) {
                            toast.warning(
                              'Biến thể này đang được giữ cho đơn chưa thanh toán, có thể chưa bỏ được.',
                            );
                          }
                        }}
                        onRestoreRows={() => {
                          setRemoved([]);
                          touch();
                          clearStruct('variants');
                        }}
                        onApplyAll={applyAll}
                        onAdjustStock={isEdit ? setStockVariant : undefined}
                        onRevalidate={(key) => {
                          if (getValues(`rows.${key}.originalPrice`) !== null)
                            void trigger(`rows.${key}.originalPrice`);
                        }}
                      />
                      {isEdit && Object.values(existing).some(Boolean) && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Bỏ một biến thể đã có: biến thể đó ngừng bán, lịch sử và đơn cũ vẫn giữ.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <SingleVariantFields
                  control={rowsControl}
                  getValues={rowsGetValues}
                  existingId={existing[SINGLE]}
                  live={existing[SINGLE] ? liveVariants.get(existing[SINGLE]!) : undefined}
                  onAdjustStock={isEdit ? setStockVariant : undefined}
                  onRevalidate={() => {
                    if (getValues(`rows.${SINGLE}.originalPrice`) !== null)
                      void trigger(`rows.${SINGLE}.originalPrice`);
                  }}
                />
              )}
            </SectionCard>
          </div>

          <SectionCard title="Vận chuyển">
            <Controller
              control={control}
              name="weight"
              rules={{
                validate: (v) => {
                  if (v === null) return 'Vui lòng nhập khối lượng.';
                  if (v < 1 || v > PRODUCT_LIMITS.weightMax)
                    return `Khối lượng từ 1 đến ${PRODUCT_LIMITS.weightMax.toLocaleString('vi-VN')} g.`;
                  return true;
                },
              }}
              render={({ field, fieldState }) => (
                <FormField
                  label="Khối lượng sau khi đóng gói"
                  htmlFor="weight"
                  required
                  error={fieldState.error?.message}
                  hint="Tính cả hộp và lớp bọc, dùng để tính phí giao hàng."
                  className="sm:max-w-xs"
                >
                  <NumberInput
                    id="weight"
                    ref={field.ref}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    suffix="g"
                    maxDigits={5}
                    placeholder="Ví dụ: 250"
                    aria-invalid={!!fieldState.error}
                  />
                </FormField>
              )}
            />
          </SectionCard>

          {isEdit && live && (
            <SectionCard
              title="Lịch sử tồn kho"
              description="Mỗi lần nhập thêm hoặc giảm tồn, kể cả tồn ban đầu."
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full border-champagne/60 text-navy"
                  onClick={() => setStockVariant(live.variants[0]?.id ?? null)}
                >
                  <PackagePlus /> Điều chỉnh tồn
                </Button>
              }
            >
              <StockHistoryList productId={live.id} variants={live.variants} />
            </SectionCard>
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-4">
            <div className="rounded-2xl border bg-card p-4 shadow-sm shadow-navy/[0.03]">
              <div className="text-sm font-semibold text-navy">Gợi ý điền thông tin</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Tin đăng đủ thông tin dễ được tìm thấy hơn.
              </p>
              <ul className="mt-3 space-y-2">
                {tips.map((t) => (
                  <li key={t.text} className="flex items-start gap-2 text-sm">
                    {t.ok ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                    ) : (
                      <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" />
                    )}
                    <span className={t.ok ? 'text-ink' : 'text-muted-foreground'}>{t.text}</span>
                  </li>
                ))}
              </ul>
            </div>
            {isEdit && status && (
              <div className="rounded-2xl border bg-card p-4 text-sm shadow-sm shadow-navy/[0.03]">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Trạng thái</span>
                  <ProductStatusBadge status={status} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-muted-foreground">Đã bán</span>
                  <b className="text-ink tabular-nums">
                    {(live?.soldCount ?? 0).toLocaleString('vi-VN')}
                  </b>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Thanh lưu dính đáy trang */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t bg-white/95 px-4 py-3 shadow-[0_-4px_16px_-8px] shadow-navy/10 backdrop-blur md:-mx-8 md:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="hidden min-w-0 flex-1 text-sm sm:block">
            {errorCount > 0 ? (
              <span className="inline-flex items-center gap-1.5 text-destructive">
                <AlertCircle className="size-4" /> Còn {errorCount} chỗ cần sửa
              </span>
            ) : dirty ? (
              <span className="text-amber-700">Có thay đổi chưa lưu</span>
            ) : (
              <span className="text-muted-foreground">
                {isEdit ? 'Chưa có thay đổi' : 'Điền thông tin rồi bấm Lưu và đăng bán'}
              </span>
            )}
          </div>
          <Button
            asChild
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-full px-6 sm:flex-none"
          >
            <Link to="/kenh-nguoi-ban/san-pham">Hủy</Link>
          </Button>
          <Button
            type="submit"
            className="h-10 flex-[2] rounded-full px-8 sm:flex-none"
            disabled={isSubmitting || (isEdit && !dirty)}
          >
            {isSubmitting && <Loader2 className="animate-spin" />}
            {isEdit ? 'Lưu thay đổi' : 'Lưu và đăng bán'}
          </Button>
        </div>
      </div>

      {isEdit && (
        <StockAdjustDialog
          productId={initialProduct.id}
          initialVariantId={stockVariant}
          open={!!stockVariant}
          onOpenChange={(o) => !o && setStockVariant(null)}
        />
      )}
    </form>
  );
}

/** Nút ẩn/hiện và xem trên sàn ở đầu trang sửa */
function EditActions({ product, shopActive }: { product: SellerProduct; shopActive: boolean }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const hide = product.status === 'ACTIVE';
  async function toggle() {
    setBusy(true);
    try {
      const result = await api<SellerProduct>(`${productPath(product.id)}/status`, {
        method: 'PATCH',
        body: { status: hide ? 'HIDDEN' : 'ACTIVE' },
      });
      queryClient.setQueryData(sellerProductKey(product.id), result);
      void queryClient.invalidateQueries({ queryKey: SELLER_PRODUCTS_KEY });
      toast.success(hide ? 'Đã ẩn sản phẩm khỏi sàn.' : 'Sản phẩm đã bán trở lại.');
    } catch (e) {
      showApiError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ProductStatusBadge status={product.status} />
      {hide && shopActive && (
        <Button asChild type="button" variant="ghost" size="sm" className="rounded-full text-navy">
          <Link to={`/san-pham/${product.id}`} target="_blank" rel="noreferrer">
            <ExternalLink /> Xem trên sàn
          </Link>
        </Button>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full border-navy/30 text-navy"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {busy ? <Loader2 className="animate-spin" /> : hide ? <EyeOff /> : <Eye />}
        {hide ? 'Ẩn sản phẩm' : 'Hiện lại'}
      </Button>
    </>
  );
}

/**
 * Chọn danh mục 2 cấp: cột trái cấp 1 (có icon), cột phải cấp 2. Sản phẩm chỉ gắn danh mục cấp 2.
 * Danh mục đã ẩn không có trong cây công khai; sản phẩm đang gắn danh mục ẩn vẫn giữ được (fallback).
 */
function CategoryPicker({
  tree,
  loading,
  value,
  onChange,
  fallback,
  error,
}: {
  tree: CategoryNode[] | undefined;
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
  fallback?: SellerProduct['category'];
  error?: string;
}) {
  const found = useMemo(() => {
    for (const p of tree ?? []) {
      const c = p.children?.find((x) => x.id === value);
      if (c) return { parent: p, child: c };
    }
    return null;
  }, [tree, value]);
  const [openParent, setOpenParent] = useState<string | null>(null);
  const activeParent =
    tree?.find((p) => p.id === (openParent ?? found?.parent.id)) ?? tree?.[0] ?? null;
  const hiddenCurrent = !!value && !found && fallback?.id === value;

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">
          Danh mục<span className="text-destructive">*</span>
        </span>
        <span className="text-xs text-muted-foreground">
          Đã chọn:{' '}
          {found ? (
            <b className="font-medium text-navy">
              {found.parent.name} › {found.child.name}
            </b>
          ) : hiddenCurrent ? (
            <b className="font-medium text-navy">
              {fallback.parent?.name} › {fallback.name}
            </b>
          ) : (
            'chưa chọn'
          )}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : (
        <div
          className={cn(
            'grid grid-cols-2 overflow-hidden rounded-xl border bg-white',
            error && 'border-destructive',
          )}
        >
          <ul className="max-h-60 overflow-y-auto border-r bg-ivory/60 py-1">
            {(tree ?? []).map((p) => {
              const active = activeParent?.id === p.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpenParent(p.id)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                      active ? 'bg-white font-medium text-navy' : 'text-ink hover:bg-white/70',
                    )}
                  >
                    <CategoryIcon
                      name={p.icon}
                      className={active ? 'text-champagne-600' : 'text-muted-foreground'}
                    />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
          <ul className="max-h-60 overflow-y-auto py-1">
            {(activeParent?.children ?? []).map((c) => {
              const active = c.id === value;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChange(c.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
                      active ? 'bg-champagne-50 font-medium text-navy' : 'text-ink hover:bg-ivory',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    {active && <CheckCircle2 className="size-4 shrink-0 text-champagne-600" />}
                  </button>
                </li>
              );
            })}
            {activeParent && !activeParent.children?.length && (
              <li className="px-3 py-2 text-xs text-muted-foreground">Chưa có danh mục con.</li>
            )}
          </ul>
        </div>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : (
        hiddenCurrent && (
          <p className="text-xs text-amber-700">
            Danh mục này đang ẩn trên sàn; sản phẩm vẫn giữ được, nhưng nếu đổi thì không chọn lại
            được.
          </p>
        )
      )}
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-[480px] rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
