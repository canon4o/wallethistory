"use client";

import { useState } from "react";
import { Check, UserMinus, X } from "lucide-react";
import {
  acceptHouseholdInvite,
  cancelHouseholdInvite,
  declineHouseholdInvite,
  leaveHousehold,
  removeHouseholdMember,
} from "@/lib/actions/household";
import type { HouseholdMember, HouseholdOverview } from "@/lib/data/household";
import type { ActionResult } from "@/lib/actions/result";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { IconButton } from "@/components/ui/IconButton";
import { InviteForm } from "./InviteForm";
import { useT } from "@/lib/i18n/client";

type Confirm = { kind: "leave" } | { kind: "remove"; member: HouseholdMember } | null;

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex max-w-xl flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

const rowClass = "flex items-center gap-2 rounded-lg border border-border bg-background p-2 pl-3";

export function HouseholdManager({ overview }: { overview: HouseholdOverview }) {
  const t = useT();
  const { members, incoming, outgoing } = overview;
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<ActionResult>, onOk?: () => void) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (result.ok) onOk?.();
    else setError(result.error);
  }

  const others = members.filter((m) => !m.isMe);

  return (
    <div className="flex flex-col gap-4">
      {error && !confirm ? <Alert tone="error">{error}</Alert> : null}

      {incoming.length > 0 ? (
        <Section title={t("Invitations for you")}>
          <ul className="flex flex-col gap-2">
            {incoming.map((invite) => (
              <li key={invite.id} className={rowClass}>
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-bold">{invite.inviterName}</span> {t("invited you to share a household.")}
                </p>
                <IconButton label={t("Accept invitation from {name}", { name: invite.inviterName })} disabled={pending} onClick={() => run(() => acceptHouseholdInvite(invite.id))}>
                  <Check className="size-4" aria-hidden="true" />
                </IconButton>
                <IconButton label={t("Decline invitation from {name}", { name: invite.inviterName })} disabled={pending} onClick={() => run(() => declineHouseholdInvite(invite.id))}>
                  <X className="size-4" aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            {t("Accepting lets everyone in the household see all your accounts and transactions, including past ones. Each person can still change only their own data.")}
          </p>
        </Section>
      ) : null}

      <Section
        title={t("Household")}
        description={t("Share a read-only view of your accounts and transactions with people you trust, like a partner or family.")}
      >
        {members.length === 0 ? (
          <p className="text-sm text-muted">{t("You are not sharing with anyone yet. Invite someone below.")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {members.map((member) => (
                <li key={member.id} className={rowClass}>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold">
                    {member.name} {member.isMe ? <Badge>{t("You")}</Badge> : null}
                  </p>
                  {!member.isMe ? (
                    <IconButton label={t("Remove {name}", { name: member.name })} onClick={() => setConfirm({ kind: "remove", member })}>
                      <UserMinus className="size-4" aria-hidden="true" />
                    </IconButton>
                  ) : null}
                </li>
              ))}
            </ul>
            <div>
              <Button variant="danger" onClick={() => setConfirm({ kind: "leave" })}>
                {t("Leave household")}
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title={t("Invite someone")}>
        <InviteForm />
        {outgoing.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-bold">{t("Pending invitations")}</h3>
            <ul className="flex flex-col gap-2">
              {outgoing.map((invite) => (
                <li key={invite.id} className={rowClass}>
                  <p className="min-w-0 flex-1 truncate text-sm">{invite.email}</p>
                  <IconButton label={t("Cancel invitation to {email}", { email: invite.email })} disabled={pending} onClick={() => run(() => cancelHouseholdInvite(invite.id))}>
                    <X className="size-4" aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "remove" ? t("Remove member") : t("Leave household")}
        description={
          confirm?.kind === "remove"
            ? t("Remove {name}? You will stop seeing each other's accounts and transactions. Nobody's data is deleted.", { name: confirm.member.name })
            : others.length === 1
              ? t("Leave the household? You will stop seeing {name}'s accounts and transactions, and they will stop seeing yours. Nobody's data is deleted.", { name: others[0].name })
              : t("Leave the household? You will stop seeing the other members' accounts and transactions, and they will stop seeing yours. Nobody's data is deleted.")
        }
        confirmLabel={confirm?.kind === "remove" ? t("Remove member") : t("Leave household")}
        pending={pending}
        error={error}
        onConfirm={() => {
          if (!confirm) return;
          const action =
            confirm.kind === "remove" ? () => removeHouseholdMember(confirm.member.id) : () => leaveHousehold();
          run(action, () => setConfirm(null));
        }}
        onClose={() => {
          setConfirm(null);
          setError(null);
        }}
      />
    </div>
  );
}
