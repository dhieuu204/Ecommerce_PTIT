import { useEffect, useState } from 'react';

/** Ô tìm: gõ xong `ms` mili giây mới đổi giá trị (đỡ gọi API mỗi phím) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
