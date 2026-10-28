"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLocale } from "@/lib/actions/users";
import { Listbox } from "@/components/ui/Listbox";
import { cn } from "@/components/ui/cn";
import { useT } from "@/lib/i18n/client";
import { LOCALES, LOCALE_NAMES, parseLocale, type Locale } from "@/lib/i18n/locales";
import { Flag } from "./Flag";

const FIELD_OPTIONS = LOCALES.map((code) => ({ value: code, label: LOCALE_NAMES[code], icon: <Flag locale={code} /> }));
const OPTIONS = FIELD_OPTIONS.map((option) => ({ ...option, shortLabel: option.value.toUpperCase() }));

/** Language switcher with flags. Saves the choice in a cookie and re-renders the page. */
export function LocaleSelect({
  locale,
  compact = false,
  menuClassName,
}: {
  locale: Locale;
  /** Small flag-and-code button for the sign-in pages; otherwise a regular labelled field. */
  compact?: boolean;
  menuClassName?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(value: string) {
    const next = parseLocale(value);
    if (!next || next === locale) return;
    startTransition(async () => {
      const result = await setLocale({ locale: next });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className={compact ? "w-24" : "w-full max-w-xs"}>
      <Listbox
        id="locale"
        label={t("Language")}
        hideLabel={compact}
        options={compact ? OPTIONS : FIELD_OPTIONS}
        value={locale}
        onChange={change}
        disabled={pending}
        triggerClassName={
          compact
            ? "min-h-10 w-full rounded-md px-2 text-sm font-semibold text-muted hover:bg-background hover:text-text focus-visible:outline-2 focus-visible:outline-primary-strong disabled:opacity-50"
            : undefined
        }
        menuClassName={cn(compact && "bottom-full mb-1 min-w-40", menuClassName)}
      />
    </div>
  );
}
