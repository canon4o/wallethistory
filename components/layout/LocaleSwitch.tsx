import { getLocale } from "@/lib/i18n/server";
import { LocaleSelect } from "./LocaleSelect";

/** Server wrapper: reads the saved language so the picker shows the right one. */
export async function LocaleSwitch({ compact = false }: { compact?: boolean }) {
  return <LocaleSelect locale={await getLocale()} compact={compact} />;
}
