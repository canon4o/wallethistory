import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { ThemeSwitch } from "./ThemeSwitch";

/** Mobile top bar: brand plus the menu button (children). Hidden on desktop, where the sidebar is shown. */
export function Topbar({ children }: { children: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-2 md:hidden">
      <Brand />
      <div className="flex items-center gap-1">
        <ThemeSwitch />
        {children}
      </div>
    </header>
  );
}
