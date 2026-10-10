import type { LucideIcon, LucideProps } from 'lucide-react';
import {
  Baby,
  Bike,
  BookOpen,
  Cable,
  Camera,
  Car,
  Dumbbell,
  Gamepad2,
  Gem,
  Gift,
  Glasses,
  Headphones,
  House,
  Laptop,
  LayoutGrid,
  Monitor,
  Package,
  PawPrint,
  Printer,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sofa,
  Sparkles,
  Speaker,
  Tablet,
  Tv,
  UtensilsCrossed,
  Watch,
} from 'lucide-react';

/**
 * Tên icon lucide (cột `icon` của danh mục, dạng kebab-case như "smartphone") → component.
 * Chỉ nạp một bộ icon chọn sẵn để không kéo cả thư viện vào bản build; tên lạ dùng icon dự phòng.
 */
const ICONS: Record<string, LucideIcon> = {
  baby: Baby,
  bike: Bike,
  'book-open': BookOpen,
  cable: Cable,
  camera: Camera,
  car: Car,
  dumbbell: Dumbbell,
  'gamepad-2': Gamepad2,
  gem: Gem,
  gift: Gift,
  glasses: Glasses,
  headphones: Headphones,
  house: House,
  home: House,
  laptop: Laptop,
  monitor: Monitor,
  package: Package,
  'paw-print': PawPrint,
  printer: Printer,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  smartphone: Smartphone,
  sofa: Sofa,
  sparkles: Sparkles,
  speaker: Speaker,
  tablet: Tablet,
  tv: Tv,
  'utensils-crossed': UtensilsCrossed,
  watch: Watch,
};

/** Icon dự phòng khi danh mục chưa có icon hoặc tên icon không có trong bộ */
export const FALLBACK_CATEGORY_ICON: LucideIcon = LayoutGrid;

export function categoryIcon(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || FALLBACK_CATEGORY_ICON;
}

/** Icon của một danh mục theo tên icon lucide */
export function CategoryIcon({
  icon,
  ...props
}: { icon: string | null | undefined } & Omit<LucideProps, 'ref'>) {
  const Icon = categoryIcon(icon);
  return <Icon aria-hidden {...props} />;
}
