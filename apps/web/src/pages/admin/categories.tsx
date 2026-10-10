import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  FolderPlus,
  FolderTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { CATEGORY_ICONS, CategoryIcon } from '@/components/category-icon';
import { EmptyState, LoadError } from '@/components/console/empty-state';
import { FormField, inputClass, nativeSelectClass } from '@/components/console/form-field';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { CATEGORIES_KEY } from '@/hooks/use-catalog';
import { API, api, ApiError } from '@/lib/api';
import type { AdminCategory } from '@/lib/catalog-types';
import { showApiError } from '@/lib/form';
import { cn } from '@/lib/utils';

const ADMIN_CATEGORIES_KEY = ['admin', 'categories'] as const;
const PATH = `${API.market}/admin/categories`;

/** "Điện thoại & Phụ kiện" → "dien-thoai-phu-kien" (bỏ dấu tiếng Việt, gạch nối) */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

/** Cửa sổ đang mở: thêm cấp 1, thêm con của một cấp 1, hoặc sửa */
type Editing =
  { mode: 'create'; parentId: string | null } | { mode: 'edit'; category: AdminCategory } | null;

/**
 * Quản trị › Danh mục (CAT-01, bộ quyền MODERATION): cây 2 cấp kèm số sản phẩm, thêm/sửa/ẩn/xóa.
 * Danh mục ẩn không hiện trên menu và không chọn được cho sản phẩm mới; sản phẩm đã gắn vẫn bán.
 */
export function CategoriesPage() {
  const queryClient = useQueryClient();
  const tree = useQuery({
    queryKey: ADMIN_CATEGORIES_KEY,
    queryFn: () => api<AdminCategory[]>(PATH),
  });
  const [expanded, setExpanded] = useState<Set<string> | 'all'>('all');
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<AdminCategory | null>(null);

  const roots = useMemo(() => tree.data ?? [], [tree.data]);
  const isOpen = (id: string) => expanded === 'all' || expanded.has(id);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const set = new Set(prev === 'all' ? roots.map((r) => r.id) : prev);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return set;
    });
  const allOpen = roots.every((r) => isOpen(r.id));

  const stats = useMemo(() => {
    const children = roots.flatMap((r) => r.children ?? []);
    return {
      roots: roots.length,
      children: children.length,
      hidden: [...roots, ...children].filter((c) => c.hidden).length,
    };
  }, [roots]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_CATEGORIES_KEY }),
      queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY }),
    ]);

  async function toggleHidden(c: AdminCategory) {
    try {
      await api(`${PATH}/${c.id}`, { method: 'PATCH', body: { hidden: !c.hidden } });
      await refresh();
      toast.success(c.hidden ? `Đã hiện "${c.name}" trên sàn.` : `Đã ẩn "${c.name}" khỏi menu.`);
    } catch (e) {
      showApiError(e);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        crumbs={[{ label: 'Kiểm duyệt' }, { label: 'Danh mục' }]}
        title="Danh mục sản phẩm"
        description="Cây 2 cấp: sản phẩm gắn vào danh mục cấp 2. Số nhỏ ở cột Thứ tự đứng trước."
        actions={
          <Button
            className="h-10 rounded-full px-5"
            onClick={() => setEditing({ mode: 'create', parentId: null })}
          >
            <Plus /> Thêm danh mục cấp 1
          </Button>
        }
      />

      <div className="overflow-hidden rounded-2xl border bg-card shadow-sm shadow-navy/[0.03]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {tree.data && (
              <>
                <span>
                  <b className="font-semibold text-ink">{stats.roots}</b> danh mục cấp 1
                </span>
                <span>
                  <b className="font-semibold text-ink">{stats.children}</b> danh mục cấp 2
                </span>
                {stats.hidden > 0 && (
                  <span>
                    <b className="font-semibold text-ink">{stats.hidden}</b> đang ẩn
                  </span>
                )}
              </>
            )}
          </div>
          {roots.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full text-navy"
              onClick={() => setExpanded(allOpen ? new Set() : 'all')}
            >
              {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
              {allOpen ? 'Thu gọn tất cả' : 'Mở tất cả'}
            </Button>
          )}
        </div>

        {/* Đầu cột (máy tính) */}
        <div className="hidden grid-cols-[minmax(0,1fr)_100px_80px_130px_140px] items-center gap-3 bg-ivory px-5 py-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase md:grid">
          <span>Danh mục</span>
          <span className="text-right">Sản phẩm</span>
          <span className="text-right">Thứ tự</span>
          <span>Hiển thị</span>
          <span />
        </div>

        {tree.isPending ? (
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-4">
                <Skeleton className="size-9 rounded-xl" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="ml-auto h-8 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : tree.isError ? (
          <LoadError message={tree.error.message} onRetry={() => void tree.refetch()} />
        ) : roots.length === 0 ? (
          <EmptyState
            icon={FolderTree}
            title="Chưa có danh mục nào"
            text="Thêm danh mục cấp 1 (ngành hàng) trước, rồi thêm các danh mục cấp 2 bên trong."
            action={
              <Button
                className="rounded-full px-5"
                onClick={() => setEditing({ mode: 'create', parentId: null })}
              >
                <Plus /> Thêm danh mục cấp 1
              </Button>
            }
          />
        ) : (
          <ul className="divide-y">
            {roots.map((root) => {
              const open = isOpen(root.id);
              const children = root.children ?? [];
              return (
                <li key={root.id}>
                  <CategoryRow
                    c={root}
                    level={1}
                    childCount={children.length}
                    open={open}
                    onToggle={() => toggle(root.id)}
                    onEdit={() => setEditing({ mode: 'edit', category: root })}
                    onAddChild={() => setEditing({ mode: 'create', parentId: root.id })}
                    onToggleHidden={() => void toggleHidden(root)}
                    onDelete={() => setDeleting(root)}
                  />
                  {open && (
                    <ul className="border-t border-dashed bg-ivory/50 py-1">
                      {children.map((child) => (
                        <li key={child.id}>
                          <CategoryRow
                            c={child}
                            level={2}
                            parentHidden={root.hidden}
                            onEdit={() => setEditing({ mode: 'edit', category: child })}
                            onToggleHidden={() => void toggleHidden(child)}
                            onDelete={() => setDeleting(child)}
                          />
                        </li>
                      ))}
                      <li className="py-1 pl-14 md:pl-[4.25rem]">
                        <button
                          type="button"
                          onClick={() => setEditing({ mode: 'create', parentId: root.id })}
                          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-navy transition hover:bg-champagne-50"
                        >
                          <Plus className="size-4 text-champagne-600" /> Thêm danh mục con
                        </button>
                      </li>
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Chỉ xóa được danh mục chưa có sản phẩm và không có danh mục con; còn lại hãy ẩn. Mọi thay
        đổi đều ghi nhật ký.
      </p>

      <CategoryDialog
        editing={editing}
        roots={roots}
        onClose={() => setEditing(null)}
        onSaved={refresh}
      />
      <DeleteDialog category={deleting} onClose={() => setDeleting(null)} onDeleted={refresh} />
    </div>
  );
}

/** Một dòng của cây (cấp 1 hoặc cấp 2) */
function CategoryRow({
  c,
  level,
  childCount = 0,
  open,
  parentHidden,
  onToggle,
  onEdit,
  onAddChild,
  onToggleHidden,
  onDelete,
}: {
  c: AdminCategory;
  level: 1 | 2;
  childCount?: number;
  open?: boolean;
  parentHidden?: boolean;
  onToggle?: () => void;
  onEdit: () => void;
  onAddChild?: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
}) {
  const canDelete = c.productCount === 0 && childCount === 0;
  return (
    <div
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 transition hover:bg-champagne-50/40 md:grid-cols-[minmax(0,1fr)_100px_80px_130px_140px] md:px-5',
        level === 1 ? 'py-3' : 'py-2',
      )}
    >
      <div className={cn('flex min-w-0 items-center gap-3', level === 2 && 'pl-8 md:pl-10')}>
        {level === 1 ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-label={open ? `Thu gọn ${c.name}` : `Mở ${c.name}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-ivory-200 hover:text-navy"
          >
            <ChevronDown className={cn('size-4 transition-transform', !open && '-rotate-90')} />
          </button>
        ) : (
          <span aria-hidden className="h-px w-4 shrink-0 bg-champagne/70" />
        )}
        {level === 1 && (
          <span
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset',
              c.hidden
                ? 'bg-muted text-muted-foreground ring-border'
                : 'bg-champagne-50 text-champagne-600 ring-champagne/40',
            )}
          >
            <CategoryIcon name={c.icon} className="size-[18px]" />
          </span>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span
              className={cn(
                'truncate',
                level === 1 ? 'font-semibold' : 'text-sm font-medium',
                c.hidden ? 'text-muted-foreground' : 'text-ink',
              )}
            >
              {c.name}
            </span>
            {level === 1 && (
              <span className="text-xs text-muted-foreground">{childCount} mục con</span>
            )}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">/{c.slug}</div>
          {/* Điện thoại: số sản phẩm, thứ tự, trạng thái dưới tên */}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground md:hidden">
            <span>
              {c.productCount.toLocaleString('vi-VN')} sản phẩm · thứ tự {c.sort}
            </span>
            <HiddenBadge c={c} parentHidden={parentHidden} />
          </div>
        </div>
      </div>
      <span className="hidden text-right text-sm text-ink tabular-nums md:block">
        {c.productCount.toLocaleString('vi-VN')}
      </span>
      <span className="hidden text-right text-sm text-muted-foreground tabular-nums md:block">
        {c.sort}
      </span>
      <span className="hidden md:block">
        <HiddenBadge c={c} parentHidden={parentHidden} showVisible />
      </span>
      <div className="flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="outline"
          className="hidden rounded-full border-navy/30 text-navy sm:inline-flex"
          onClick={onEdit}
        >
          <Pencil /> Sửa
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="ghost"
              className="rounded-full"
              aria-label={`Thao tác với ${c.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Sửa
            </DropdownMenuItem>
            {level === 1 && (
              <DropdownMenuItem onSelect={onAddChild}>
                <FolderPlus /> Thêm danh mục con
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={onToggleHidden}>
              {c.hidden ? <Eye /> : <EyeOff />} {c.hidden ? 'Hiện lại trên sàn' : 'Ẩn khỏi menu'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {canDelete ? (
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 /> Xóa
              </DropdownMenuItem>
            ) : (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2 text-sm opacity-60">
                  <Trash2 className="size-4" /> Xóa
                </div>
                <p className="mt-0.5 pl-6 leading-snug">
                  {childCount > 0
                    ? 'Còn danh mục con nên không xóa được, hãy ẩn thay vì xóa.'
                    : `Đã có ${c.productCount.toLocaleString('vi-VN')} sản phẩm nên không xóa được, hãy ẩn thay vì xóa.`}
                </p>
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function HiddenBadge({
  c,
  parentHidden,
  showVisible,
}: {
  c: AdminCategory;
  parentHidden?: boolean;
  showVisible?: boolean;
}) {
  if (c.hidden) return <StatusBadge tone="neutral">Đã ẩn</StatusBadge>;
  if (parentHidden) return <StatusBadge tone="pending">Ẩn theo cấp 1</StatusBadge>;
  return showVisible ? <StatusBadge tone="success">Đang hiện</StatusBadge> : null;
}

interface FormValues {
  name: string;
  slug: string;
  /** '' = danh mục cấp 1 */
  parentId: string;
  icon: string | null;
  sort: string;
  hidden: boolean;
}

/** Thêm / sửa danh mục */
function CategoryDialog({
  editing,
  roots,
  onClose,
  onSaved,
}: {
  editing: Editing;
  roots: AdminCategory[];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const cat = editing?.mode === 'edit' ? editing.category : null;
  const childCount = cat ? (roots.find((r) => r.id === cat.id)?.children?.length ?? 0) : 0;
  const initialParent =
    editing?.mode === 'create' ? (editing.parentId ?? '') : (cat?.parentId ?? '');
  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: { name: '', slug: '', parentId: '', icon: null, sort: '10', hidden: false },
  });
  const [slugTouched, setSlugTouched] = useState(false);

  useEffect(() => {
    if (!editing) return;
    // Thứ tự gợi ý: sau mục cuối cùng cùng cấp
    const siblings =
      editing.mode === 'create'
        ? editing.parentId
          ? (roots.find((r) => r.id === editing.parentId)?.children ?? [])
          : roots
        : [];
    const nextSort = siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 10 : 10;
    reset({
      name: cat?.name ?? '',
      slug: cat?.slug ?? '',
      parentId: initialParent,
      icon: cat?.icon ?? null,
      sort: String(cat?.sort ?? Math.min(nextSort, 9999)),
      hidden: cat?.hidden ?? false,
    });
    // Sửa: không tự đổi slug theo tên (slug đang dùng trên đường dẫn)
    setSlugTouched(!!cat);
    // chỉ điền lại khi mở cửa sổ mới
  }, [editing]);

  const parentId = watch('parentId');
  const isRoot = parentId === '';
  const parentName = roots.find((r) => r.id === initialParent)?.name;

  async function onSubmit(f: FormValues) {
    const common = {
      name: f.name.trim(),
      slug: f.slug.trim(),
      sort: Number(f.sort),
      ...(isRoot ? { icon: f.icon } : {}),
    };
    try {
      if (!cat) {
        await api(PATH, { method: 'POST', body: { ...common, parentId: f.parentId || null } });
        toast.success(`Đã thêm danh mục "${common.name}".`);
      } else {
        const newParent = f.parentId || null;
        await api(`${PATH}/${cat.id}`, {
          method: 'PATCH',
          body: {
            ...common,
            hidden: f.hidden,
            ...(newParent !== cat.parentId ? { parentId: newParent } : {}),
          },
        });
        toast.success(`Đã lưu danh mục "${common.name}".`);
      }
      await onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === 'SLUG_TAKEN') {
          setError('slug', { type: 'server', message: e.message }, { shouldFocus: true });
          return;
        }
        if (['INVALID_PARENT', 'CATEGORY_HAS_CHILDREN', 'CATEGORY_IN_USE'].includes(e.code)) {
          setError('parentId', { type: 'server', message: e.message });
          return;
        }
      }
      showApiError(e, setError);
    }
  }

  const title = !editing
    ? ''
    : cat
      ? `Sửa danh mục "${cat.name}"`
      : initialParent
        ? `Thêm danh mục con của "${parentName ?? ''}"`
        : 'Thêm danh mục cấp 1';

  const nameField = register('name', {
    validate: (v) => {
      const n = v.trim().length;
      if (!n) return 'Vui lòng nhập tên danh mục.';
      if (n > 60) return 'Tên danh mục tối đa 60 ký tự.';
      return true;
    },
  });

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && !isSubmitting && onClose()}>
      <DialogContent className="max-h-[94vh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
          <DialogHeader className="text-left">
            <DialogTitle className="pr-6 text-navy">{title}</DialogTitle>
            <DialogDescription>
              {isRoot
                ? 'Danh mục cấp 1 là ngành hàng trên thanh danh mục, có icon riêng.'
                : 'Sản phẩm gắn vào danh mục cấp 2.'}
            </DialogDescription>
          </DialogHeader>

          <FormField label="Tên danh mục" htmlFor="c-name" required error={errors.name?.message}>
            <Input
              id="c-name"
              maxLength={60}
              placeholder={isRoot ? 'Ví dụ: Điện thoại' : 'Ví dụ: Ốp lưng'}
              aria-invalid={!!errors.name}
              className={inputClass}
              {...nameField}
              onChange={(e) => {
                void nameField.onChange(e);
                if (!slugTouched) {
                  setValue('slug', slugify(e.target.value), {
                    shouldValidate: getFieldState('slug').isTouched,
                  });
                }
              }}
            />
          </FormField>

          <FormField
            label="Slug (đường dẫn)"
            htmlFor="c-slug"
            required
            error={errors.slug?.message}
            hint={
              cat
                ? 'Đổi slug thì đường dẫn cũ /danh-muc/… không mở được nữa.'
                : 'Tự tạo từ tên, sửa được. Chữ thường không dấu, số, dấu gạch nối.'
            }
          >
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                /danh-muc/
              </span>
              <Input
                id="c-slug"
                maxLength={80}
                aria-invalid={!!errors.slug}
                className={cn(inputClass, 'pl-[6.25rem] font-mono text-sm')}
                {...register('slug', {
                  onChange: () => setSlugTouched(true),
                  validate: (v) => {
                    const s = v.trim();
                    if (!s) return 'Vui lòng nhập slug.';
                    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s))
                      return 'Slug chỉ gồm chữ thường không dấu, số và dấu gạch nối, ví dụ dien-thoai.';
                    return true;
                  },
                })}
              />
            </div>
          </FormField>

          {/* Danh mục cha: thêm con thì cố định; sửa thì chuyển được */}
          {(cat || initialParent) && (
            <FormField
              label="Thuộc danh mục cấp 1"
              htmlFor="c-parent"
              error={errors.parentId?.message}
              hint={
                !cat
                  ? undefined
                  : !cat.parentId && childCount > 0
                    ? 'Danh mục đang có danh mục con nên phải giữ ở cấp 1.'
                    : cat.parentId && cat.productCount > 0
                      ? 'Danh mục đã có sản phẩm: chuyển được sang cấp 1 khác, không thành cấp 1.'
                      : 'Chuyển sang danh mục cấp 1 khác, hoặc chọn "Không" để thành cấp 1.'
              }
            >
              <select
                id="c-parent"
                className={nativeSelectClass}
                disabled={!cat || (!cat.parentId && childCount > 0)}
                aria-invalid={!!errors.parentId}
                {...register('parentId')}
              >
                <option value="" disabled={!!cat?.parentId && cat.productCount > 0}>
                  Không (là danh mục cấp 1)
                </option>
                {roots
                  .filter((r) => r.id !== cat?.id)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.hidden ? ' (đang ẩn)' : ''}
                    </option>
                  ))}
              </select>
            </FormField>
          )}

          {isRoot && (
            <Controller
              control={control}
              name="icon"
              render={({ field }) => (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-ink">Icon</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      Xem trước
                      <span className="flex size-7 items-center justify-center rounded-lg bg-champagne-50 text-champagne-600 ring-1 ring-champagne/40">
                        <CategoryIcon name={field.value} />
                      </span>
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 rounded-xl border bg-ivory/60 p-2 sm:grid-cols-8">
                    {Object.entries(CATEGORY_ICONS).map(([name, Icon]) => {
                      const active = field.value === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          title={name}
                          aria-label={`Icon ${name}`}
                          aria-pressed={active}
                          onClick={() => field.onChange(active ? null : name)}
                          className={cn(
                            'flex aspect-square items-center justify-center rounded-lg transition',
                            active
                              ? 'bg-navy text-champagne shadow-sm'
                              : 'bg-white text-ink/70 ring-1 ring-border hover:text-navy hover:ring-champagne',
                          )}
                        >
                          <Icon className="size-[18px]" />
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Hiện trên thanh danh mục và mega menu. Bấm lại để bỏ chọn.
                  </p>
                </div>
              )}
            />
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Thứ tự"
              htmlFor="c-sort"
              error={errors.sort?.message}
              hint="Số nhỏ đứng trước (0–9999)."
            >
              <Input
                id="c-sort"
                inputMode="numeric"
                aria-invalid={!!errors.sort}
                className={cn(inputClass, 'tabular-nums')}
                {...register('sort', {
                  validate: (v) =>
                    /^\d{1,4}$/.test(v.trim()) ? true : 'Thứ tự là số nguyên từ 0 đến 9999.',
                })}
              />
            </FormField>
            {cat && (
              <Controller
                control={control}
                name="hidden"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <span className="text-sm font-medium text-ink">Hiển thị</span>
                    <label className="flex h-10 cursor-pointer items-center gap-2.5 rounded-lg border bg-white px-3">
                      <Switch checked={!field.value} onCheckedChange={(v) => field.onChange(!v)} />
                      <span className="text-sm text-ink">
                        {field.value ? 'Đang ẩn' : 'Hiện trên sàn'}
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Ẩn: sản phẩm đã gắn vẫn bán bình thường.
                    </p>
                  </div>
                )}
              />
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" disabled={isSubmitting} onClick={onClose}>
              Hủy
            </Button>
            <Button type="submit" className="min-w-28" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {cat ? 'Lưu' : 'Thêm danh mục'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Xác nhận xóa (chỉ danh mục chưa có sản phẩm và không có con) */
function DeleteDialog({
  category,
  onClose,
  onDeleted,
}: {
  category: AdminCategory | null;
  onClose: () => void;
  onDeleted: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  useEffect(() => setBlocked(null), [category]);

  async function remove() {
    if (!category) return;
    setBusy(true);
    try {
      await api(`${PATH}/${category.id}`, { method: 'DELETE' });
      toast.success(`Đã xóa danh mục "${category.name}".`);
      await onDeleted();
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CATEGORY_IN_USE') {
        // Vừa có sản phẩm/danh mục con gắn vào: giải thích và tải lại cây
        setBlocked(e.message);
        void onDeleted();
      } else showApiError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle className="pr-6 text-navy">Xóa danh mục "{category?.name}"?</DialogTitle>
          <DialogDescription>
            Danh mục chưa có sản phẩm nào nên xóa hẳn được. Thao tác không hoàn tác.
          </DialogDescription>
        </DialogHeader>
        {blocked && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {blocked}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {blocked ? 'Đóng' : 'Không'}
          </Button>
          {!blocked && (
            <Button
              disabled={busy}
              onClick={() => void remove()}
              className="bg-red-600 hover:bg-red-700"
            >
              {busy && <Loader2 className="animate-spin" />} Xóa danh mục
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
