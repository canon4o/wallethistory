"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { QuickGoalDepositForm } from "@/components/goals/QuickGoalDepositForm";
import { TransactionForm } from "@/components/transactions/TransactionForm";
import { TransferForm } from "@/components/transactions/TransferForm";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import type { QuickAddOptions } from "@/lib/data/quick-add";
import { useT } from "@/lib/i18n/client";

export type QuickAddKind = "transaction" | "transfer" | "goal";

export type QuickAddState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; options: QuickAddOptions };

type QuickAddSheetsProps = {
  kind: QuickAddKind | null;
  state: QuickAddState;
  onRetry: () => void;
  onClose: () => void;
};

const linkClass = "font-semibold text-primary-strong underline";

/** The three quick-add dialogs. Loaded on demand, so pages that never open them do not download the forms. */
export default function QuickAddSheets({ kind, state, onRetry, onClose }: QuickAddSheetsProps) {
  const t = useT();

  function body(content: (options: QuickAddOptions) => ReactNode): ReactNode {
    if (state.status === "loading") return <Spinner label={t("Loading…")} />;
    if (state.status === "error") {
      return (
        <div className="flex flex-col items-start gap-3">
          <Alert tone="error">{state.message}</Alert>
          <Button variant="secondary" onClick={onRetry}>
            {t("Try again")}
          </Button>
        </div>
      );
    }
    return content(state.options);
  }

  const noAccounts = (
    <p className="text-sm text-muted">
      {t("Create an account first under")}{" "}
      <Link href="/profile/accounts" className={linkClass} onClick={onClose}>
        {t("Profile → Accounts")}
      </Link>
      .
    </p>
  );

  return (
    <>
      <Modal open={kind === "transaction"} title={t("Add transaction")} onClose={onClose}>
        {body((options) =>
          options.accounts.length === 0 ? (
            noAccounts
          ) : (
            <TransactionForm
              accounts={options.accounts}
              categories={options.categories}
              tags={options.tags}
              defaultAccountId={options.defaultAccountId}
              onDone={onClose}
            />
          ),
        )}
      </Modal>
      <Modal open={kind === "transfer"} title={t("Add transfer")} onClose={onClose}>
        {body((options) =>
          options.accounts.length === 0 ? (
            noAccounts
          ) : options.transferTargets.length < 2 ? (
            <p className="text-sm text-muted">{t("Add a second account to move money between accounts.")}</p>
          ) : (
            <TransferForm accounts={options.accounts} toAccounts={options.transferTargets} onDone={onClose} />
          ),
        )}
      </Modal>
      <Modal open={kind === "goal"} title={t("Goal deposit")} onClose={onClose}>
        {body((options) =>
          options.accounts.length === 0 ? (
            noAccounts
          ) : options.goals.length === 0 ? (
            <p className="text-sm text-muted">
              {t("Create a goal first on the")}{" "}
              <Link href="/goals" className={linkClass} onClick={onClose}>
                {t("Goals page")}
              </Link>
              .
            </p>
          ) : (
            <QuickGoalDepositForm goals={options.goals} accounts={options.accounts} onDone={onClose} />
          ),
        )}
      </Modal>
    </>
  );
}
