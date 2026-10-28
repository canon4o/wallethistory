"use client";

import { useState } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { useT } from "@/lib/i18n/client";
import { updateTheme } from "@/lib/actions/users";
import { THEMES, THEME_LABELS, type Theme } from "@/lib/theme";
import { IconButton } from "@/components/ui/IconButton";

const ICONS = { system: SunMoon, light: Sun, dark: Moon } as const;

function nextTheme(theme: Theme): Theme {
  return THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
}

/** Cycles System, Light, Dark. Applies at once and saves in a cookie in the background. */
export function ThemeToggle({ theme: initial }: { theme: Theme }) {
  const t = useT();
  const [theme, setTheme] = useState(initial);
  const Icon = ICONS[theme];

  function cycle() {
    const next = nextTheme(theme);
    setTheme(next);
    document.documentElement.dataset.theme = next;
    void updateTheme({ theme: next });
  }

  return (
    <IconButton label={t("Theme: {theme}. Switch to {next}", { theme: t(THEME_LABELS[theme]), next: t(THEME_LABELS[nextTheme(theme)]) })} onClick={cycle}>
      <Icon className="size-5" aria-hidden="true" />
    </IconButton>
  );
}
