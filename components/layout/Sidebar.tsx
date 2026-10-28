import type { CurrentUser } from "@/lib/auth/session";
import { Brand } from "./Brand";
import { ThemeSwitch } from "./ThemeSwitch";
import { NavLinks } from "./NavLinks";
import { UserFooter } from "./UserFooter";

/** Desktop navigation. On mobile the same items live in the MobileNav drawer. */
export function Sidebar({ user }: { user: CurrentUser }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-4 border-r border-border bg-surface p-3 md:flex">
      <div className="flex items-center justify-between gap-2">
        <Brand />
        <ThemeSwitch />
      </div>
      <div className="flex-1 overflow-y-auto">
        <NavLinks isAdmin={user.role === "admin"} />
      </div>
      <UserFooter user={user} />
    </aside>
  );
}
