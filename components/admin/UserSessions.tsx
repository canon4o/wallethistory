"use client";

import { useState, useTransition } from "react";
import { revokeUserSession } from "@/lib/actions/admin";
import { DEFAULT_TIMEZONE } from "@/lib/timezones";
import { formatDateTime } from "@/lib/format";
import type { AdminSessionRow } from "@/lib/data/admin";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { describeUserAgent } from "@/lib/user-agent";
import { useT } from "@/lib/i18n/client";

/** Devices a user is signed in on. Admins can sign one out (not for their own account). */
export function UserSessions({
  userId,
  sessions,
  canRevoke,
  timezone = DEFAULT_TIMEZONE,
}: {
  userId: string;
  sessions: AdminSessionRow[];
  canRevoke: boolean;
  /** Timezone the times are shown in (the viewing admin's). */
  timezone?: string;
}) {
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <EmptyState title={t("Not signed in anywhere")} />;
  }

  return (
    <>
      {error ? (
        <div className="mb-2">
          <Alert tone="error">{error}</Alert>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <caption className="sr-only">{t("Active sessions")}</caption>
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">{t("Browser")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("IP")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("Signed in")}</th>
              <th scope="col" className="px-3 py-2 font-semibold">{t("Last active")}</th>
              {canRevoke ? <th scope="col" className="px-3 py-2"><span className="sr-only">{t("Actions")}</span></th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sessions.map((session) => (
              <tr key={session.id}>
                <td className="px-3 py-2">{describeUserAgent(session.userAgent, t)}</td>
                <td className="px-3 py-2">{session.ip ?? t("Unknown")}</td>
                <td className="whitespace-nowrap px-3 py-2">{formatDateTime(session.createdAt, timezone, t)}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  {session.lastSeenAt ? formatDateTime(session.lastSeenAt, timezone, t) : t("Unknown")}
                </td>
                {canRevoke ? (
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="secondary"
                      disabled={pending}
                      onClick={() => {
                        setError(null);
                        startTransition(async () => {
                          const result = await revokeUserSession({ userId, sessionId: session.id });
                          if (!result.ok) setError(result.error);
                        });
                      }}
                    >
                      {t("Sign out")}
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
