import { adminAuditLog } from "@/db/schema";
import type { getDb } from "@/db";

type Db = ReturnType<typeof getDb>;
/** The database itself or a transaction: audit rows are written in the same transaction as the action. */
export type DbOrTx = Db | Parameters<Parameters<Db["transaction"]>[0]>[0];

export type AdminActionName = (typeof adminAuditLog.$inferInsert)["action"];

/**
 * Records what an admin did and to whom. The emails are snapshots, so the row stays readable
 * after either user is deleted. Never put passwords, tokens or financial data in `detail`.
 */
export async function writeAuditLog(
  db: DbOrTx,
  entry: {
    actor: { id: string; email: string };
    action: AdminActionName;
    target?: { id: string; email: string };
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(adminAuditLog).values({
    actorId: entry.actor.id,
    actorEmail: entry.actor.email,
    targetUserId: entry.target?.id ?? null,
    targetEmail: entry.target?.email ?? null,
    action: entry.action,
    detail: entry.detail ?? null,
  });
}
