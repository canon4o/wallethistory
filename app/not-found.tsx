import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Page not found") };
}

export default async function NotFound() {
  const t = await getT();
  return (
    <main id="main" tabIndex={-1} className="flex flex-1 items-center justify-center p-4 focus:outline-none">
      <div className="flex w-full max-w-md flex-col gap-3">
        <h1 className="text-xl font-bold">{t("Page not found")}</h1>
        <p className="text-sm text-muted">{t("The page you are looking for does not exist or was moved.")}</p>
        <div>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-white hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-strong"
          >
            {t("Go to WalletHistory")}
          </Link>
        </div>
      </div>
    </main>
  );
}
