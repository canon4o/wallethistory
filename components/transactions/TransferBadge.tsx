import { ArrowLeftRight } from "lucide-react";

/** Stands in for a category badge on transfer rows. */
export function TransferBadge() {
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-accounts text-white">
      <ArrowLeftRight className="size-4" aria-hidden="true" />
    </span>
  );
}
