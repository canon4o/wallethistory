import {
  ArrowLeftRight,
  ChartColumn,
  LayoutDashboard,
  Landmark,
  Repeat,
  Coins,
  Target,
  Users,
  Settings,
  ShieldCheck,
  Shapes,
  Tags,
  UserRound,
  LayoutList,
  ScrollText,
  Megaphone,
  LogIn,
  Scale,
  TrendingUp,
  PieChart,
  GitCompare,
  ChartLine,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@/lib/i18n/translate";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Active only on this exact path (for a child whose path is the parent of its siblings). */
  exact?: boolean;
  children?: NavItem[];
};

// A future Planning section gets its own entry here (its color is already reserved in globals.css).
export const NAV_ITEMS: NavItem[] = [
  { label: msg("Dashboard"), href: "/dashboard", icon: LayoutDashboard },
  { label: msg("Transactions"), href: "/transactions", icon: ArrowLeftRight },
  { label: msg("Budgets"), href: "/budgets", icon: Coins },
  { label: msg("Goals"), href: "/goals", icon: Target },
  {
    label: msg("Reports"),
    href: "/reports",
    icon: ChartColumn,
    children: [
      { label: msg("Cash flow"), href: "/reports/cash-flow", icon: TrendingUp },
      { label: msg("Spending"), href: "/reports/spending", icon: PieChart },
      { label: msg("Comparison"), href: "/reports/comparison", icon: GitCompare },
      { label: msg("Balance"), href: "/reports/balance", icon: Scale },
      { label: msg("Forecast"), href: "/reports/forecast", icon: ChartLine },
    ],
  },
  {
    label: msg("Profile"),
    href: "/profile",
    icon: UserRound,
    children: [
      { label: msg("Settings"), href: "/profile/settings", icon: Settings },
      { label: msg("Accounts"), href: "/profile/accounts", icon: Landmark },
      { label: msg("Categories"), href: "/profile/categories", icon: Shapes },
      { label: msg("Tags"), href: "/profile/tags", icon: Tags },
      { label: msg("Recurring"), href: "/profile/recurring", icon: Repeat },
      { label: msg("Household"), href: "/profile/household", icon: Users },
    ],
  },
];

/** Shown only to admins. The /admin pages themselves answer 404 to everyone else. */
export const ADMIN_NAV_ITEM: NavItem = {
  label: msg("Admin"),
  href: "/admin",
  icon: ShieldCheck,
  children: [
    { label: msg("Overview"), href: "/admin", icon: LayoutList, exact: true },
    { label: msg("Users"), href: "/admin/users", icon: Users },
    { label: msg("Logins"), href: "/admin/logins", icon: LogIn },
    { label: msg("Announcement"), href: "/admin/announcement", icon: Megaphone },
    { label: msg("Audit log"), href: "/admin/audit", icon: ScrollText },
  ],
};

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
