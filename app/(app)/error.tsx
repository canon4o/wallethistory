"use client";

import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { useT } from "@/lib/i18n/client";

// Shown when a page in the app section fails to load (for example a database error).
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useT();
  return (
    <div className="flex max-w-md flex-col gap-3">
      <h1 className="text-xl font-bold">{t("Something went wrong")}</h1>
      <Alert tone="error">{t("We could not load this page. Please try again.")}</Alert>
      <div>
        <Button onClick={reset}>{t("Try again")}</Button>
      </div>
    </div>
  );
}
