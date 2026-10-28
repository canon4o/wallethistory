import type { Metadata } from "next";
import { getT } from "@/lib/i18n/server";
import { AnnouncementForm } from "@/components/admin/AnnouncementForm";
import { AnnouncementHistory } from "@/components/admin/AnnouncementHistory";
import { requireAdmin } from "@/lib/auth/session";
import { getActiveAnnouncement, listAnnouncementHistory } from "@/lib/data/announcements";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Admin · Announcement") };
}

export default async function AdminAnnouncementPage() {
  const admin = await requireAdmin();
  const [current, history] = await Promise.all([getActiveAnnouncement(), listAnnouncementHistory()]);
  return (
    <div className="flex flex-col gap-6">
      <AnnouncementForm current={current} />
      <AnnouncementHistory rows={history} timezone={admin.timezone} />
    </div>
  );
}
