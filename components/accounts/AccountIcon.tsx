import {
  Banknote,
  Briefcase,
  Car,
  CircleHelp,
  CreditCard,
  Gift,
  Home,
  Landmark,
  PiggyBank,
  Plane,
  Smartphone,
  Tag,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { isAccountIconKey, type AccountIconKey } from "@/lib/account-icons";
import { readableTextColor } from "@/lib/category-colors";

// Typed as a full record so adding a key to lib/account-icons.ts without an icon fails to compile.
const ICONS: Record<AccountIconKey, LucideIcon> = {
  wallet: Wallet,
  banknote: Banknote,
  landmark: Landmark,
  "credit-card": CreditCard,
  "piggy-bank": PiggyBank,
  briefcase: Briefcase,
  home: Home,
  car: Car,
  plane: Plane,
  smartphone: Smartphone,
  gift: Gift,
  tag: Tag,
};

/** Renders the icon for a stored key. Unknown keys get a neutral fallback instead of crashing. */
export function AccountIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = isAccountIconKey(icon) ? ICONS[icon] : CircleHelp;
  return <Icon className={className ?? "size-4"} aria-hidden="true" />;
}

/** The account icon on a colored, rounded badge. Used wherever an account is shown. */
export function AccountBadge({
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
      <AccountIcon icon={icon} className={size === "lg" ? "size-5" : "size-4"} />
    </span>
  );
}
