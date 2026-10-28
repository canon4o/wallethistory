import { Analytics } from "@vercel/analytics/next"
import type { Metadata, Viewport } from "next";
import { Comfortaa } from "next/font/google";
import { CookieNotice } from "@/components/layout/CookieNotice";
import { cookies } from "next/headers";
import { I18nProvider } from "@/lib/i18n/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { SpeedInsights } from "@vercel/speed-insights/next"
import { THEME_COOKIE, toTheme } from "@/lib/theme";
import "./globals.css";

const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin", "cyrillic"],
  fallback: ["system-ui", "sans-serif"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: {
      default: "WalletHistory",
      template: "%s | WalletHistory",
    },
    description: t("Track your accounts, transactions, and budgets."),
    icons: { apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "WalletHistory", statusBarStyle: "default" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f8f9" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1719" },
  ],
};

// Only the Vercel production deployment is tracked; previews, local dev and self-hosted installs are not.
const isVercelProduction = process.env.VERCEL_ENV === "production"

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The theme lives in a cookie; rendering it on <html> on the server means there is no flash
  // of the wrong theme.
  const theme = toTheme((await cookies()).get(THEME_COOKIE)?.value);
  const locale = await getLocale();
  const t = await getT();
  return (
    <html lang={locale} data-theme={theme} className={`${comfortaa.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
        >
          {t("Skip to content")}
        </a>
        <I18nProvider locale={locale}>
          {children}
          <CookieNotice />
        </I18nProvider>
        {isVercelProduction && (
          <>
            <Analytics/>
            <SpeedInsights/>
          </>
        )}
      </body>
    </html>
  );
}
