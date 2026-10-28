import type { ReactNode } from "react";
import { cn } from "./cn";

const tones = {
  error: "border-expense bg-expense/10 text-expense-text",
  success: "border-income bg-income/15 text-text",
  info: "border-border bg-background text-text",
} as const;

export function Alert({
  tone = "info",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-md border px-3 py-2 text-sm", tones[tone])}
    >
      {children}
    </div>
  );
}
