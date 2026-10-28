import Link from "next/link";
import type { ReactNode } from "react";

export function AuthLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-10 items-center font-semibold text-primary-strong underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-primary-strong"
    >
      {children}
    </Link>
  );
}
