import { cookies } from "next/headers";
import { THEME_COOKIE, toTheme } from "@/lib/theme";
import { ThemeToggle } from "./ThemeToggle";

/** Server wrapper: reads the saved theme so the toggle renders the right icon. */
export async function ThemeSwitch() {
  return <ThemeToggle theme={toTheme((await cookies()).get(THEME_COOKIE)?.value)} />;
}
