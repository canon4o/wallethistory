"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

const STORAGE_KEY = "wh_cookie_notice_ok";

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let acknowledgedFallback = false;

function isAcknowledged(): boolean {
  if (acknowledgedFallback) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Short cookie notice with one OK button. The choice is remembered in this browser only. */
export function CookieNotice() {
  const t = useT();
  // The server never knows the choice, so it renders nothing; the client shows the notice after hydration.
  const acknowledged = useSyncExternalStore(subscribe, isAcknowledged, () => true);
  if (acknowledged) return null;
  return (
    <div
      role="region"
      aria-label={t("Cookie notice")}
      className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-border bg-surface px-4 py-3 text-sm text-text shadow-lg"
    >
      <p className="min-w-0 flex-1">
        {t("We use cookies to keep you signed in and to remember your settings.")}
      </p>
      <Button
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            // Storage unavailable: the notice just hides until the next visit.
          }
          // Hide it for this visit even when storage is blocked.
          acknowledgedFallback = true;
          listeners.forEach((listener) => listener());
        }}
      >
        {t("OK")}
      </Button>
    </div>
  );
}
