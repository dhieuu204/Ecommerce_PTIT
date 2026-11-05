import {
  IconBabyCarriage,
  IconBarbell,
  IconBike,
  IconBook,
  IconCamera,
  IconCar,
  IconChefHat,
  IconDeviceSpeaker,
  IconDeviceTv,
  IconDiamond,
  IconEyeglass,
  IconGift,
  IconLayoutGrid,
  IconPackage,
  IconPaw,
  IconPrinter,
  IconShoppingBag,
  IconSofa,
  IconToolsKitchen2,
  type Icon,
  type IconProps,
} from '@tabler/icons-react';
import {
  HkCharger,
  HkHeadphones,
  HkHouse,
  HkLaptop,
  HkGamepad,
  HkMonitor,
  HkPhone,
  HkSerum,
  HkShirt,
  HkTablet,
  HkWatch,
} from './hk-icons';

/** Kiểu component icon danh mục: 9 danh mục chính dùng bộ icon riêng HK Shop (hk-icons.tsx), còn lại bộ Tabler */
export type CategoryIconComponent = Icon;

/**
 * Tên icon (cột `icon` của danh mục, dạng kebab-case như "smartphone"; giữ tên cũ theo bộ lucide để dữ
 * liệu đã lưu không phải đổi) → component Tabler. Chỉ nạp một bộ icon chọn sẵn; tên lạ dùng icon dự
 * phòng. Admin chọn icon danh mục từ chính bộ này.
 */
export const CATEGORY_ICONS: Record<string, Icon> = {
  baby: IconBabyCarriage,
  bike: IconBike,
  'book-open': IconBook,
  cable: HkCharger,
  camera: IconCamera,
  car: IconCar,
  'cooking-pot': IconChefHat,
  dumbbell: IconBarbell,
  'gamepad-2': HkGamepad,
  gem: IconDiamond,
  gift: IconGift,
  glasses: IconEyeglass,
  headphones: HkHeadphones,
  house: HkHouse,
  laptop: HkLaptop,
  monitor: HkMonitor,
  package: IconPackage,
  'paw-print': IconPaw,
  printer: IconPrinter,
  shirt: HkShirt,
  'shopping-bag': IconShoppingBag,
  smartphone: HkPhone,
  sofa: IconSofa,
  sparkles: HkSerum,
  speaker: IconDeviceSpeaker,
  tablet: HkTablet,
  tv: IconDeviceTv,
  'utensils-crossed': IconToolsKitchen2,
  watch: HkWatch,
};

/** Icon dự phòng khi danh mục chưa có icon hoặc tên icon không có trong bộ */
export const FALLBACK_CATEGORY_ICON: Icon = IconLayoutGrid;

export function categoryIcon(name: string | null | undefined): Icon {
  return (name && CATEGORY_ICONS[name]) || FALLBACK_CATEGORY_ICON;
}

/** Icon của một danh mục theo tên icon */
export function CategoryIcon({
  icon,
  ...props
}: { icon: string | null | undefined } & Omit<IconProps, 'ref'>) {
  const Component = categoryIcon(icon);
  return <Component aria-hidden {...props} />;
}
