import { getEnv } from "@/lib/env";

/**
 * Whether cookies get the `Secure` flag: in production, only when the app is served over https
 * (`APP_URL`). Browsers drop Secure cookies on plain http, so a self-hosted install reached at
 * http://192.168.x.x:port needs `APP_URL` to say http for logins to work.
 */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production" && getEnv().APP_URL.startsWith("https://");
}
