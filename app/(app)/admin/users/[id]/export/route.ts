import { notFound } from "next/navigation";
import { and, count, eq, gte } from "drizzle-orm";
import { getDb } from "@/db";
import { adminAuditLog } from "@/db/schema";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireAdmin } from "@/lib/auth/session";
import { buildUserExport } from "@/lib/data/admin-export";
import { userExportZip } from "@/lib/data/admin-export-files";
import { exportUserSchema } from "@/lib/validation/admin";

const MAX_EXPORTS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

function text(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

/**
 * GDPR-style copy of one user's data (a zip with one CSV per kind of data), for an admin, only on request: the admin must give a reason,
 * which is recorded in the audit log together with who exported whose data. The file is generated
 * on demand and never stored. POST only (a form on the user page), same-origin only.
 */
export async function POST(request: Request, { params }: RouteContext<"/admin/users/[id]/export">) {
  const admin = await requireAdmin();

  // A browser form post from our own pages always sends a matching Origin; anything else is refused.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return text(403, "Forbidden");

  const form = await request.formData().catch(() => null);
  const parsed = exportUserSchema.safeParse({
    userId: (await params).id,
    reason: form?.get("reason"),
  });
  if (!parsed.success) {
    return text(400, parsed.error.issues[0]?.message ?? "Invalid request");
  }
  const { userId, reason } = parsed.data;

  const db = getDb();
  const [{ recent }] = await db
    .select({ recent: count() })
    .from(adminAuditLog)
    .where(
      and(
        eq(adminAuditLog.actorId, admin.id),
        eq(adminAuditLog.action, "data_exported"),
        gte(adminAuditLog.createdAt, new Date(Date.now() - HOUR_MS)),
      ),
    );
  if (recent >= MAX_EXPORTS_PER_HOUR) return text(429, "Too many exports. Try again later.");

  const data = await buildUserExport(userId);
  if (!data) notFound();

  // The audit row comes first: if it cannot be written, no data is handed out.
  await writeAuditLog(db, {
    actor: admin,
    action: "data_exported",
    target: { id: data.profile.id, email: data.profile.email },
    detail: { reason },
  });

  const day = data.exportedAt.toISOString().slice(0, 10);
  return new Response(new Uint8Array(userExportZip(data)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="wallethistory-export-${userId.slice(0, 8)}-${day}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
