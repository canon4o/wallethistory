import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { DISMISSED_ANNOUNCEMENT_COOKIE } from "@/lib/announcement";
import { materializeForUser } from "@/lib/recurring/materialize";
import { getActiveAnnouncement } from "@/lib/data/announcements";
import { listBudgetAlerts, type BudgetAlert } from "@/lib/data/budget-alerts";
import { BudgetAlerts } from "@/components/budgets/BudgetAlerts";
import { AnnouncementBanner } from "@/components/layout/AnnouncementBanner";
import { MobileNav } from "@/components/layout/MobileNav";
import { NavLinks } from "@/components/layout/NavLinks";
import { RegionProvider } from "@/components/layout/RegionProvider";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { UserFooter } from "@/components/layout/UserFooter";

/** Alerts are a convenience: if they cannot be read, the page still renders without the strip. */
async function loadBudgetAlerts(): Promise<BudgetAlert[]> {
  try {
    return await listBudgetAlerts();
  } catch (error) {
    console.error("Could not load budget alerts:", error);
    return [];
  }
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  await materializeForUser(user);
  const announcement = await getActiveAnnouncement();
  const budgetAlerts = await loadBudgetAlerts();
  const dismissed = (await cookies()).get(DISMISSED_ANNOUNCEMENT_COOKIE)?.value === announcement?.id;
  return (
    <RegionProvider region={{ currency: user.currency, timezone: user.timezone }}>
    <div className="flex min-h-dvh">
      <Sidebar user={user} />
      <div className="flex min-w-0 flex-1 flex-col">
        {announcement && !dismissed ? <AnnouncementBanner {...announcement} /> : null}
        <BudgetAlerts alerts={budgetAlerts} />
        <Topbar>
          <MobileNav>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NavLinks isAdmin={user.role === "admin"} />
            </div>
            <UserFooter user={user} />
          </MobileNav>
        </Topbar>
        <main id="main" tabIndex={-1} className="flex-1 p-4 focus:outline-none md:p-6">
          {children}
        </main>
      </div>
    </div>
    </RegionProvider>
  );
}
