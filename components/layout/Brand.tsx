import Link from "next/link";
import { Wallet } from "lucide-react";

export function Brand() {
  return (
    <Link
      href="/dashboard"
      className="flex min-h-10 items-center gap-2 rounded-md px-1 text-base font-bold focus-visible:outline-2 focus-visible:outline-primary-strong"
    >
      <Wallet className="size-5 text-primary-strong" aria-hidden="true" />
      WalletHistory
    </Link>
  );
}
