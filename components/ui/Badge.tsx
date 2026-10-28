import type { ReactNode } from "react";
import { cn } from "./cn";

type Tone = "neutral" | "income" | "expense" | "accounts";

const tones: Record<Tone, string> = {
  neutral: "bg-background text-text border border-border",
  income: "bg-income text-on-accent",
  expense: "bg-expense text-on-accent",
  accounts: "bg-accounts text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
