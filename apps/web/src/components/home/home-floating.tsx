import { IconChevronUp } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CategoryIcon } from '@/components/catalog/category-icon';
import { useCategories } from '@/hooks/use-catalog';
import type { CategoryNode } from '@/lib/catalog-types';
import { cn } from '@/lib/utils';

/** Số danh mục hiện khi thanh thu gọn */
const COLLAPSED = 3;
const MAX_ITEMS = 9;

/**
 * Một danh mục trên thanh. Trỏ vào: mục thành dải cam nối liền từ mép trái thanh, tràn ra bên phải, đầu phải
 * bo tròn; icon chuyển trắng và tên danh mục trượt ra trong dải.
 */
function RailItem({ category }: { category: CategoryNode }) {
  return (
    <Link
      to={`/danh-muc/${category.slug}`}
      className="group/item flex h-12 w-max min-w-full items-center rounded-r-full text-charcoal transition-colors duration-200 hover:bg-navy hover:text-white focus-visible:bg-navy focus-visible:text-white focus-visible:outline-none"
    >
      <span className="flex w-12 shrink-0 justify-center">
        <CategoryIcon icon={category.icon} className="size-6" />
      </span>
      <span className="max-w-0 overflow-hidden text-[13px] font-medium whitespace-nowrap opacity-0 transition-[max-width,opacity,padding] duration-300 ease-out group-hover/item:max-w-56 group-hover/item:pr-5 group-hover/item:opacity-100 group-focus-visible/item:max-w-56 group-focus-visible/item:pr-5 group-focus-visible/item:opacity-100 motion-reduce:transition-none">
        {category.name}
      </span>
    </Link>
  );
}

/**
 * Thanh dọc nổi bên trái để nhảy nhanh tới danh mục: bình thường là viên trắng gọn với 3 danh mục đầu; rê
 * chuột (hoặc Tab vào) thì dài ra mượt, hiện đủ danh mục. Chỉ hiện khi màn đủ rộng để không che nội dung.
 */
export function SideRail() {
  const { data } = useCategories();
  const items = (data ?? []).slice(0, MAX_ITEMS);
  if (items.length === 0) return null;
  const head = items.slice(0, COLLAPSED);
  const rest = items.slice(COLLAPSED);

  return (
    <nav
      aria-label="Đi nhanh tới danh mục"
      className="group/rail fixed top-1/2 left-4 z-30 hidden w-12 -translate-y-1/2 flex-col rounded-full bg-card py-5 shadow-[0_8px_24px_-12px_rgba(15,26,61,0.22)] ring-1 ring-black/[0.04] min-[1400px]:flex"
    >
      {head.map((c) => (
        <RailItem key={c.id} category={c} />
      ))}
      {rest.length > 0 && (
        /* Phần bung ra: chiều cao trượt từ 0 tới đủ (grid 0fr → 1fr) */
        <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-300 ease-out group-focus-within/rail:grid-rows-[1fr] group-hover/rail:grid-rows-[1fr] motion-reduce:transition-none">
          {/* Cắt theo chiều dọc (theo chiều cao đang trượt) nhưng chừa bên phải cho dải cam có tên */}
          <div className="flex min-h-0 flex-col [clip-path:inset(0_-20rem_0_0)]">
            {rest.map((c) => (
              <RailItem key={c.id} category={c} />
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

/** Nút tròn lên đầu trang ở góc phải dưới, hiện khi đã cuộn quá một màn hình */
export function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Lên đầu trang"
      onClick={() =>
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        })
      }
      className={cn(
        'fixed right-4 bottom-5 z-30 flex size-12 items-center justify-center rounded-full bg-card text-ink shadow-[0_12px_28px_-12px_rgba(15,26,61,0.4)] ring-1 ring-black/[0.05] transition-all duration-300 hover:bg-navy hover:text-white md:right-6 md:bottom-8',
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0',
      )}
    >
      <IconChevronUp className="size-6 [stroke-width:1.75]" />
    </button>
  );
}
