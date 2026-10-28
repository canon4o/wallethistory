import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthLink } from "@/components/auth/AuthLink";
import { ResendVerificationForm } from "@/components/auth/ResendVerificationForm";
import { VerifyEmailForm } from "@/components/auth/VerifyEmailForm";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Verify email") };
}

export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const t = await getT();
  const { token } = await searchParams;
  // Rendering this page never changes state: the token is only consumed by the form's button.
  if (typeof token === "string" && token) {
    return (
      <>
        <AuthHeading title={t("Verify your email")} />
        <VerifyEmailForm token={token} />
        <AuthLink href="/login">{t("Go to log in")}</AuthLink>
      </>
    );
  }

  return (
    <>
      <AuthHeading title={t("Verify your email")} />
      <Alert tone="error">{t("This link is invalid or has expired.")}</Alert>
      <p className="text-sm text-muted">{t("Enter your email to get a new verification link.")}</p>
      <ResendVerificationForm />
      <AuthLink href="/login">{t("Go to log in")}</AuthLink>
    </>
  );
}
