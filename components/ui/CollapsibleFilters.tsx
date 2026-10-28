"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { cn } from "./cn";

type FiltersToggle = { open: boolean; toggle: () => void; panelId: string };

const FiltersToggleContext = createContext<FiltersToggle | null>(null);

function useFiltersToggle(): FiltersToggle {
  const value = useContext(FiltersToggleContext);
  if (!value) throw new Error("Filters components must be used inside FiltersToggleProvider");
  return value;
}

/** Shares the open/closed state between the toggle button (in the page header) and the filter panel. */
export function FiltersToggleProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <FiltersToggleContext value={{ open, toggle: () => setOpen((value) => !value), panelId }}>{children}</FiltersToggleContext>;
}

/** The "Filters" button with the number of applied filters. Small screens only. */
export function FiltersToggleButton({ activeCount }: { activeCount: number }) {
  const t = useT();
  const { open, toggle, panelId } = useFiltersToggle();
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={toggle}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm font-semibold text-text hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong sm:hidden"
    >
      <SlidersHorizontal className="size-4" aria-hidden="true" />
      {t("Filters")}
      {activeCount > 0 ? (
        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 text-xs font-bold text-primary-soft-foreground">
          {activeCount}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The filter fields. Below `sm` they are hidden until the button is pressed and form their own card;
 * from `sm` up they are always shown as grid items of the parent form (`contents`). Hidden fields stay
 * in the DOM, so the form still submits them.
 */
export function CollapsibleFilters({ children }: { children: ReactNode }) {
  const { open, panelId } = useFiltersToggle();
  return (
    <div
      id={panelId}
      className={cn("mb-4 grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 sm:contents", open ? "grid" : "hidden")}
    >
      {children}
    </div>
  );
}
