import type { ReactNode } from "react";
import { cn } from "./cn";

export const controlClass = cn(
  "min-h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text",
  "placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary-strong",
  "disabled:cursor-not-allowed disabled:bg-background disabled:text-muted",
  "aria-[invalid=true]:border-expense",
);

type FieldProps = {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** Keeps the label for screen readers only (for controls whose purpose is obvious, like a language picker). */
  hideLabel?: boolean;
  children: ReactNode;
};

/** Label + control + hint/error wrapper shared by Input, Select and custom controls. */
export function Field({ id, label, error, hint, hideLabel, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cn("text-sm font-semibold", hideLabel && "sr-only")}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-xs font-semibold text-expense-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
