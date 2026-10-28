"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MailCheck, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { blockUser, changeUserRole, deleteUser, revokeUserSessions, unblockUser, verifyUserEmail } from "@/lib/actions/admin";
import type { ActionResult } from "@/lib/actions/result";
import { ExportUserButton } from "@/components/admin/ExportUserButton";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useT } from "@/lib/i18n/client";
import { msg } from "@/lib/i18n/translate";

type Props = {
  user: { id: string; name: string; email: string; role: "user" | "admin"; blocked: boolean; verified: boolean };
  /** True when the admin is looking at their own account: no actions are offered. */
  isSelf: boolean;
};

const EXPORT_NOTE =
  msg("Export data is the only place an admin can see financial data. Every export is recorded.");

type Confirm = "block" | "revoke" | "verify" | null;

export function UserActions({ user, isSelf }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState(user.role);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (isSelf) {
    return (
      <section aria-label={t("Actions")} className="rounded-lg border border-border bg-surface p-3">
        <h2 className="mb-3 text-sm font-bold">{t("Actions")}</h2>
        <p className="mb-3 text-sm text-muted">
          {t("This is your own account. Role, blocking and deleting are not available for yourself.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <ExportUserButton userId={user.id} name={user.name} />
        </div>
        <p className="mt-2 text-xs text-muted">{t(EXPORT_NOTE)}</p>
      </section>
    );
  }

  function run(action: () => Promise<ActionResult>, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onDone?.();
    });
  }

  function closeDelete() {
    setDeleting(false);
    setConfirmEmail("");
    setDeleteError(null);
  }

  return (
    <section aria-label={t("Actions")} className="mb-4 rounded-lg border border-border bg-surface p-3">
      <h2 className="mb-3 text-sm font-bold">{t("Actions")}</h2>
      {error ? (
        <div className="mb-3">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-full sm:w-40">
            <Select
              id="user-role"
              label={t("Role")}
              value={role}
              onChange={(event) => setRole(event.target.value as "user" | "admin")}
              disabled={pending}
            >
              <option value="user">{t("User")}</option>
              <option value="admin">{t("Admin")}</option>
            </Select>
          </div>
          <Button
            variant="secondary"
            disabled={pending || role === user.role}
            onClick={() => run(() => changeUserRole({ userId: user.id, role }))}
          >
            <ShieldCheck className="size-4" aria-hidden="true" />
            {t("Save role")}
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.blocked ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => unblockUser({ userId: user.id }))}>
              <ShieldCheck className="size-4" aria-hidden="true" />
              {t("Unblock")}
            </Button>
          ) : (
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm("block")}>
              <ShieldAlert className="size-4" aria-hidden="true" />
              {t("Block")}
            </Button>
          )}
          {user.verified ? null : (
            <Button variant="secondary" disabled={pending} onClick={() => setConfirm("verify")}>
              <MailCheck className="size-4" aria-hidden="true" />
              {t("Verify email")}
            </Button>
          )}
          <Button variant="secondary" disabled={pending} onClick={() => setConfirm("revoke")}>
            <LogOut className="size-4" aria-hidden="true" />
            {t("Sign out everywhere")}
          </Button>
          <Button variant="danger" disabled={pending} onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" aria-hidden="true" />
            {t("Delete user")}
          </Button>
        </div>

        <div>
          <ExportUserButton userId={user.id} name={user.name} />
          <p className="mt-2 text-xs text-muted">{t(EXPORT_NOTE)}</p>
        </div>
      </div>

      <ConfirmDialog
        open={confirm === "block"}
        title={t("Block this user?")}
        description={t("They are signed out everywhere and cannot log in until you unblock them. Their data is kept.")}
        confirmLabel={t("Block user")}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => blockUser({ userId: user.id }), () => setConfirm(null))}
      />
      <ConfirmDialog
        open={confirm === "verify"}
        title={t("Verify this email?")}
        description={t("Mark the email as verified without the user clicking the link. Use this only when you know the address belongs to them.")}
        confirmLabel={t("Verify email")}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => verifyUserEmail({ userId: user.id }), () => setConfirm(null))}
      />
      <ConfirmDialog
        open={confirm === "revoke"}
        title={t("Sign out everywhere?")}
        description={t("Every device this user is signed in on is signed out. They can log in again.")}
        confirmLabel={t("Sign out")}
        pending={pending}
        onClose={() => setConfirm(null)}
        onConfirm={() => run(() => revokeUserSessions({ userId: user.id }), () => setConfirm(null))}
      />

      <Modal open={deleting} title={t("Delete this user?")} onClose={closeDelete}>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setDeleteError(null);
            startTransition(async () => {
              const result = await deleteUser({ userId: user.id, confirmEmail });
              if (!result.ok) {
                setDeleteError(result.fieldErrors?.confirmEmail?.[0] ?? result.error);
                return;
              }
              closeDelete();
              router.push("/admin/users");
            });
          }}
        >
          <div className="text-sm text-muted">
            <p>
              {t("This permanently deletes")} <strong className="text-text">{user.name}</strong> {t("and all of their accounts, categories, tags, transactions, transfers and budgets. This cannot be undone.")}
            </p>
            <p className="mt-2">
              {t("Transfers that other people sent to this user's accounts are removed too, which changes the sender's history. A household left with one person is dissolved.")}
            </p>
          </div>
          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}
          <Input
            id="delete-user-email"
            label={t("Type {email} to confirm", { email: user.email })}
            autoComplete="off"
            value={confirmEmail}
            onChange={(event) => setConfirmEmail(event.target.value)}
          />
          <div className="grid grid-cols-2 gap-2 lg:flex lg:justify-end">
            <Button variant="secondary" onClick={closeDelete} disabled={pending}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant="danger" disabled={pending || confirmEmail.trim() === ""}>
              {pending ? t("Deleting…") : t("Delete user")}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
