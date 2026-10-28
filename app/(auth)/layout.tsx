import type { ReactNode } from "react";
import { Wallet } from "lucide-react";
import { LocaleSwitch } from "@/components/layout/LocaleSwitch";
import { ThemeSwitch } from "@/components/layout/ThemeSwitch";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center px-4 py-8 focus:outline-none">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2 text-lg font-bold">
          <Wallet className="size-6 text-primary-strong" aria-hidden="true" />
          WalletHistory
        </div>
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5">
          {children}
        </div>
        <div className="flex items-center justify-center gap-1">
          <LocaleSwitch compact />
          <ThemeSwitch />
        </div>
      </div>
    </main>
  );
}
