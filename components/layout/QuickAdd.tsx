"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeftRight, Plus, Target } from "lucide-react";
import { loadQuickAddOptions } from "@/lib/actions/quick-add";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/components/ui/cn";
import { showsQuickAdd } from "./quick-add-paths";
import type { QuickAddKind, QuickAddState } from "./QuickAddSheets";
import { useHideOnScroll } from "./useHideOnScroll";

// The forms are only downloaded after the first action is chosen.
const QuickAddSheets = dynamic(() => import("./QuickAddSheets"), { ssr: false });

const itemClass =
  "inline-flex size-12 items-center justify-center rounded-full shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong";
const labelClass = "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-semibold text-text shadow-lg";

function isTextField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable='true']");
}

/**
 * Mobile speed dial: a floating "+" that opens Add transaction, Add transfer and Goal deposit.
 * It slides away while scrolling down and when a text field has focus (on-screen keyboard).
 */
export function QuickAdd() {
  const t = useT();
  const pathname = usePathname();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<QuickAddKind | null>(null);
  const [typing, setTyping] = useState(false);
  const [state, setState] = useState<QuickAddState>({ status: "loading" });
  const loadStarted = useRef(false);
  const closeDial = useCallback(() => setOpen(false), []);
  const scrolledAway = useHideOnScroll(closeDial);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    const result = await loadQuickAddOptions().catch(() => null);
    if (result?.ok) setState({ status: "ready", options: result.options });
    else setState({ status: "error", message: result?.error ?? t("Could not load the form.") });
  }, [t]);

  function ensureLoaded() {
    if (loadStarted.current) return;
    loadStarted.current = true;
    void load();
  }

  useEffect(() => {
    function onFocusChange(event: FocusEvent) {
      setTyping(event.type === "focusin" && isTextField(event.target));
    }
    document.addEventListener("focusin", onFocusChange);
    document.addEventListener("focusout", onFocusChange);
    return () => {
      document.removeEventListener("focusin", onFocusChange);
      document.removeEventListener("focusout", onFocusChange);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!showsQuickAdd(pathname)) return null;

  const hidden = (scrolledAway || typing) && !open;
  const actions: Array<{ kind: QuickAddKind; label: string; icon: typeof Plus; className: string }> = [
    { kind: "goal", label: t("Goal deposit"), icon: Target, className: "bg-goals text-on-accent" },
    { kind: "transfer", label: t("Add transfer"), icon: ArrowLeftRight, className: "bg-accounts text-white" },
    { kind: "transaction", label: t("Add transaction"), icon: Plus, className: "bg-primary text-white" },
  ];

  return (
    <>
      {open ? <div aria-hidden="true" className="fixed inset-0 z-20 bg-scrim md:hidden" onClick={closeDial} /> : null}
      <div
        inert={hidden}
        className={cn(
          "fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 z-30 flex flex-col items-end gap-3 transition-[transform,opacity] duration-200 md:hidden",
          "[:root[data-cookie-notice]_&]:bottom-[calc(6rem+env(safe-area-inset-bottom))]",
          hidden && "pointer-events-none translate-y-32 opacity-0 motion-reduce:translate-y-0",
        )}
      >
        {open ? (
          <ul id={menuId} className="flex flex-col items-end gap-3">
            {actions.map((action) => (
              <li key={action.kind} className="flex items-center gap-3">
                <span className={labelClass} aria-hidden="true">
                  {action.label}
                </span>
                <button
                  type="button"
                  aria-label={action.label}
                  className={cn(itemClass, action.className)}
                  onClick={() => {
                    setOpen(false);
                    setKind(action.kind);
                  }}
                >
                  <action.icon className="size-5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <button
          type="button"
          aria-label={open ? t("Close") : t("Quick add")}
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          className="inline-flex size-14 items-center justify-center rounded-full bg-primary text-white shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
          onClick={() => {
            ensureLoaded();
            setOpen((value) => !value);
          }}
        >
          <Plus className={cn("size-7 transition-transform motion-reduce:transition-none", open && "rotate-45")} aria-hidden="true" />
        </button>
      </div>
      {kind ? <QuickAddSheets kind={kind} state={state} onRetry={load} onClose={() => setKind(null)} /> : null}
    </>
  );
}
