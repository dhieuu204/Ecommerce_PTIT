import { useQuery } from '@tanstack/react-query';
import { Label } from '@/components/ui/label';
import { API, api } from '@/lib/api';
import type { Place, WardPlace } from '@/lib/types';
import { cn } from '@/lib/utils';

export interface LocationValue {
  provinceId?: number;
  districtId?: number;
  wardCode?: string;
}

interface LocationFieldsProps {
  value: LocationValue;
  onChange: (value: LocationValue) => void;
  /** Lỗi từng ô (từ form hoặc details.fields của API) */
  errors?: { provinceId?: string; districtId?: string; wardCode?: string };
  className?: string;
}

const STALE = 60 * 60 * 1000;
const selectClass =
  'h-10 w-full rounded-lg border border-input bg-white px-3 text-sm outline-none transition focus:border-champagne focus:ring-[3px] focus:ring-champagne/30 disabled:bg-muted disabled:text-muted-foreground aria-invalid:border-destructive';

/**
 * Ba ô chọn Tỉnh → Huyện → Xã (mã GHN, lấy từ marketplace-service). Chọn tỉnh khác thì xóa huyện, xã đã chọn.
 * Dùng select gốc của trình duyệt: trên điện thoại mở bảng chọn quen thuộc của máy.
 */
export function LocationFields({ value, onChange, errors = {}, className }: LocationFieldsProps) {
  const provinces = useQuery({
    queryKey: ['locations', 'provinces'],
    queryFn: () => api<Place[]>(`${API.market}/locations/provinces`),
    staleTime: STALE,
  });
  const districts = useQuery({
    queryKey: ['locations', 'districts', value.provinceId],
    queryFn: () => api<Place[]>(`${API.market}/locations/provinces/${value.provinceId}/districts`),
    enabled: !!value.provinceId,
    staleTime: STALE,
  });
  const wards = useQuery({
    queryKey: ['locations', 'wards', value.districtId],
    queryFn: () => api<WardPlace[]>(`${API.market}/locations/districts/${value.districtId}/wards`),
    enabled: !!value.districtId,
    staleTime: STALE,
  });

  const field = (id: string, label: string, error: string | undefined, select: React.ReactNode) => (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {select}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );

  return (
    <div className={cn('grid gap-4 sm:grid-cols-3', className)}>
      {field(
        'provinceId',
        'Tỉnh / Thành phố',
        errors.provinceId,
        <select
          id="provinceId"
          className={selectClass}
          aria-invalid={!!errors.provinceId}
          value={value.provinceId ?? ''}
          onChange={(e) => onChange({ provinceId: Number(e.target.value) || undefined })}
        >
          <option value="">{provinces.isPending ? 'Đang tải…' : 'Chọn tỉnh/thành'}</option>
          {provinces.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>,
      )}
      {field(
        'districtId',
        'Quận / Huyện',
        errors.districtId,
        <select
          id="districtId"
          className={selectClass}
          aria-invalid={!!errors.districtId}
          disabled={!value.provinceId}
          value={value.districtId ?? ''}
          onChange={(e) =>
            onChange({
              provinceId: value.provinceId,
              districtId: Number(e.target.value) || undefined,
            })
          }
        >
          <option value="">Chọn quận/huyện</option>
          {districts.data?.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>,
      )}
      {field(
        'wardCode',
        'Phường / Xã',
        errors.wardCode,
        <select
          id="wardCode"
          className={selectClass}
          aria-invalid={!!errors.wardCode}
          disabled={!value.districtId}
          value={value.wardCode ?? ''}
          onChange={(e) => onChange({ ...value, wardCode: e.target.value || undefined })}
        >
          <option value="">Chọn phường/xã</option>
          {wards.data?.map((w) => (
            <option key={w.code} value={w.code}>
              {w.name}
            </option>
          ))}
        </select>,
      )}
    </div>
  );
}
