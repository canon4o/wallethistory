import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Accessible name; also shown as a tooltip. */
  label: string;
};

export function IconButton({ label, className, type = "button", children, ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-md text-muted transition-colors hover:bg-background hover:text-text",
        "focus-visible:outline-2 focus-visible:outline-primary-strong disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
