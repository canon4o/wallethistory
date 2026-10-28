import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthLink } from "@/components/auth/AuthLink";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Reset password") };
}

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const t = await getT();
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";
  return (
    <>
      <AuthHeading title={t("Set a new password")} />
      {value ? (
        <ResetPasswordForm token={value} />
      ) : (
        <>
          <Alert tone="error">{t("This reset link is invalid or has expired.")}</Alert>
          <AuthLink href="/forgot-password">{t("Request a new link")}</AuthLink>
        </>
      )}
    </>
  );
}
