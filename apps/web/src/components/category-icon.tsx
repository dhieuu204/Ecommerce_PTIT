import {
  Baby,
  BookOpen,
  Cable,
  Camera,
  Car,
  CookingPot,
  Dumbbell,
  Gamepad2,
  Gem,
  Gift,
  Headphones,
  House,
  Laptop,
  type LucideIcon,
  Monitor,
  PawPrint,
  Printer,
  Shirt,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Speaker,
  Tablet,
  Tag,
  Tv,
  Watch,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Icon lucide cho danh mục cấp 1 (cột `icon` lưu tên kebab-case, ví dụ "smartphone").
 * Chỉ nhập những icon hợp với ngành hàng để gói JS nhỏ; tên lạ thì hiện icon nhãn.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  tablet: Tablet,
  laptop: Laptop,
  monitor: Monitor,
  watch: Watch,
  headphones: Headphones,
  speaker: Speaker,
  cable: Cable,
  camera: Camera,
  tv: Tv,
  printer: Printer,
  'gamepad-2': Gamepad2,
  shirt: Shirt,
  'shopping-bag': ShoppingBag,
  gem: Gem,
  house: House,
  'cooking-pot': CookingPot,
  sparkles: Sparkles,
  baby: Baby,
  'paw-print': PawPrint,
  dumbbell: Dumbbell,
  car: Car,
  'book-open': BookOpen,
  gift: Gift,
};

export function CategoryIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = (name && CATEGORY_ICONS[name]) || Tag;
  return <Icon className={cn('size-4', className)} aria-hidden />;
}
