"use client";

import { useRef, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import { useT } from "@/lib/i18n/client";

/** Slide-in drawer built on a native <dialog> (focus trap, Escape and backdrop included). */
export function MobileNav({ children }: { children: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        aria-label={t("Open menu")}
        onClick={() => ref.current?.showModal()}
        className="inline-flex size-10 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong"
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <dialog
        ref={ref}
        aria-label={t("Menu")}
        onClick={(event) => {
          // Backdrop click, or a click on any link inside the drawer, closes it.
          const target = event.target as HTMLElement;
          if (target === ref.current || target.closest("a")) ref.current?.close();
        }}
        className="my-0 ml-auto mr-0 h-dvh max-h-dvh w-72 max-w-[85vw] border-l border-border bg-surface p-0 text-text backdrop:bg-scrim"
      >
        <div className="flex h-full flex-col gap-4 p-3">
          <div className="flex justify-end">
            <button
              type="button"
              aria-label={t("Close menu")}
              onClick={() => ref.current?.close()}
              className="inline-flex size-10 items-center justify-center rounded-md hover:bg-background focus-visible:outline-2 focus-visible:outline-primary-strong"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4">{children}</div>
        </div>
      </dialog>
    </>
  );
}
