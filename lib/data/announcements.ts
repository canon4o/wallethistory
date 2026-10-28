import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { announcements, users } from "@/db/schema";
import { requireAdmin, requireUser } from "@/lib/auth/session";
import { cachedGlobal, TTL } from "@/lib/cache";

export type ActiveAnnouncement = { id: string; message: string; level: "info" | "warning" };

/** The banner every signed-in user sees, or null. */
export async function getActiveAnnouncement(): Promise<ActiveAnnouncement | null> {
  await requireUser();
  // Read on every page render but changed a few times a year; admin actions clear this key.
  return cachedGlobal("announcement", TTL.announcement, async () => {
    const [row] = await getDb()
      .select({ id: announcements.id, message: announcements.message, level: announcements.level })
      .from(announcements)
      .where(eq(announcements.active, true))
      .limit(1);
    return row ?? null;
  });
}

export type AnnouncementHistoryRow = {
  id: string;
  message: string;
  level: "info" | "warning";
  active: boolean;
  createdAt: Date;
  /** Null when the admin who published it has since been deleted. */
  createdByEmail: string | null;
};

const HISTORY_LIMIT = 50;

/** Every banner ever published, newest first (the active one is flagged). Admin only. */
export async function listAnnouncementHistory(): Promise<AnnouncementHistoryRow[]> {
  await requireAdmin();
  return getDb()
    .select({
      id: announcements.id,
      message: announcements.message,
      level: announcements.level,
      active: announcements.active,
      createdAt: announcements.createdAt,
      createdByEmail: users.email,
    })
    .from(announcements)
    .leftJoin(users, eq(users.id, announcements.createdBy))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(HISTORY_LIMIT);
}
