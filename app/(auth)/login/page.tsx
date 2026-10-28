import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { AuthHeading } from "@/components/auth/AuthHeading";
import { AuthLink } from "@/components/auth/AuthLink";
import { LoginForm } from "@/components/auth/LoginForm";
import { isSignupEnabled } from "@/lib/auth/settings";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Log in") };
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const t = await getT();
  const { verified, reset } = await searchParams;
  const signupOpen = await isSignupEnabled();
  return (
    <>
      <AuthHeading title={t("Log in")} subtitle={t("Welcome back.")} />
      {verified ? <Alert tone="success">{t("Email verified. You can log in now.")}</Alert> : null}
      {reset ? <Alert tone="success">{t("Password updated. Log in with your new password.")}</Alert> : null}
      <LoginForm />
      <div className="flex flex-col text-sm">
        <AuthLink href="/forgot-password">{t("Forgot your password?")}</AuthLink>
        {signupOpen ? (
          <span className="flex flex-wrap items-center gap-x-1 text-muted">
            {t("New here?")} <AuthLink href="/register">{t("Create an account")}</AuthLink>
          </span>
        ) : null}
      </div>
    </>
  );
}
