"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useT } from "@/lib/i18n/client";

// Shown when something outside the signed-in app fails (for example the login page).
export default function RootError({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center p-4 focus:outline-none">
      <div className="flex w-full max-w-md flex-col gap-3">
        <h1 className="text-xl font-bold">{t("Something went wrong")}</h1>
        <Alert tone="error">{t("We could not load this page. Please try again.")}</Alert>
        <div>
          <Button onClick={reset}>{t("Try again")}</Button>
        </div>
      </div>
    </main>
  );
}
