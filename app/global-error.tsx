"use client";

import "./globals.css";
import { useT } from "@/lib/i18n/client";

// Last resort: replaces the root layout when the layout itself fails.
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center p-4">
        <main className="flex w-full max-w-md flex-col gap-3">
          <h1 className="text-xl font-bold">{t("Something went wrong")}</h1>
          <p className="text-sm text-muted">{t("WalletHistory could not load. Please try again.")}</p>
          <div>
            <button
              type="button"
              onClick={reset}
              className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
            >
              {t("Try again")}
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
