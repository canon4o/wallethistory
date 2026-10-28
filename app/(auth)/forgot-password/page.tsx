import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthLink } from "@/components/auth/AuthLink";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Forgot password") };
}

export default async function ForgotPasswordPage() {
  const t = await getT();
  return (
    <>
      <AuthHeading
        title={t("Forgot your password?")}
        subtitle={t("Enter your email and we will send you a reset link.")}
      />
      <ForgotPasswordForm />
      <AuthLink href="/login">{t("Back to log in")}</AuthLink>
    </>
  );
}
