import { getEnv } from "@/lib/env";

/** Absolute URL for links in emails. Always built from APP_URL, never hardcoded. */
export function buildAppUrl(path: string, params?: Record<string, string>): string {
  const url = new URL(path, getEnv().APP_URL);
  for (const [key, value] of Object.entries(params ?? {})) url.searchParams.set(key, value);
  return url.toString();
}
