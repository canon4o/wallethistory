import {
  Baby,
  BookOpen,
  Banknote,
  Briefcase,
  Bus,
  Car,
  Coffee,
  CircleHelp,
  CreditCard,
  Dumbbell,
  Ellipsis,
  Film,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  PawPrint,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Tag,
  Undo2,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isCategoryIconKey, type CategoryIconKey } from "@/lib/category-icons";
import { readableTextColor } from "@/lib/category-colors";

// Typed as a full record so adding a key to lib/category-icons.ts without an icon fails to compile.
const ICONS: Record<CategoryIconKey, LucideIcon> = {
  banknote: Banknote,
  wallet: Wallet,
  "piggy-bank": PiggyBank,
  "credit-card": CreditCard,
  receipt: Receipt,
  briefcase: Briefcase,
  laptop: Laptop,
  gift: Gift,
  "undo-2": Undo2,
  utensils: Utensils,
  coffee: Coffee,
  "shopping-cart": ShoppingCart,
  "shopping-bag": ShoppingBag,
  home: Home,
  zap: Zap,
  wifi: Wifi,
  smartphone: Smartphone,
  car: Car,
  bus: Bus,
  plane: Plane,
  "heart-pulse": HeartPulse,
  dumbbell: Dumbbell,
  film: Film,
  "gamepad-2": Gamepad2,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  baby: Baby,
  "paw-print": PawPrint,
  wrench: Wrench,
  tag: Tag,
  ellipsis: Ellipsis,
};

/** Renders the icon for a stored key. Unknown keys get a neutral fallback instead of crashing. */
export function CategoryIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = isCategoryIconKey(icon) ? ICONS[icon] : CircleHelp;
  return <Icon className={className ?? "size-4"} aria-hidden="true" />;
}

/** The category icon on a colored, rounded badge. Used wherever a category is shown. */
export function CategoryBadge({
  icon,
  color,
  size = "md",
}: {
  icon: string;
  color: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${size === "lg" ? "size-10" : "size-8"}`}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      <CategoryIcon icon={icon} className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  );
}
