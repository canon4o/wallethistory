import { msg } from "@/lib/i18n/translate";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];

export const DEFAULT_THEME: Theme = "system";

/** Cookie that remembers the theme for pages shown while signed out (login, register). */
export const THEME_COOKIE = "wh_theme";
export const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const THEME_LABELS: Record<Theme, string> = {
  system: msg("System"),
  light: msg("Light"),
  dark: msg("Dark"),
};

/** Narrows a stored or cookie value to a known theme, falling back to the default. */
export function toTheme(value: unknown): Theme {
  return THEMES.find((theme) => theme === value) ?? DEFAULT_THEME;
}
