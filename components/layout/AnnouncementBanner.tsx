"use client";

import { useState } from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { DISMISSED_ANNOUNCEMENT_COOKIE } from "@/lib/announcement";
import { useT } from "@/lib/i18n/client";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * The admin's banner. Dismissing it hides it for this browser (a cookie keyed by the banner id);
 * a new or edited banner has a new id and shows again.
 */
export function AnnouncementBanner({
  id,
  message,
  level,
}: {
  id: string;
  message: string;
  level: "info" | "warning";
}) {
  const t = useT();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const Icon = level === "warning" ? TriangleAlert : Info;
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-2 border-b px-4 py-2 text-sm",
        level === "warning" ? "border-planning bg-planning/15" : "border-primary bg-primary/10",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 whitespace-pre-line break-words">{message}</p>
      <button
        type="button"
        aria-label={t("Dismiss announcement")}
        onClick={() => {
          document.cookie = `${DISMISSED_ANNOUNCEMENT_COOKIE}=${id}; path=/; max-age=${THIRTY_DAYS}; samesite=lax`;
          setHidden(true);
        }}
        className="-my-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-background/60 focus-visible:outline-2 focus-visible:outline-primary-strong"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
