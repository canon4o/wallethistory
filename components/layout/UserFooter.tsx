import { LogOut } from "lucide-react";
import { logout } from "@/lib/actions/auth";
import type { CurrentUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/Button";
import { getT } from "@/lib/i18n/server";

export async function UserFooter({ user }: { user: CurrentUser }) {
  const t = await getT();
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="min-w-0 px-1">
        <p className="truncate text-sm font-bold">{user.name}</p>
        <p className="truncate text-xs text-muted">{user.email}</p>
      </div>
      <form action={logout}>
        <Button type="submit" variant="secondary" className="w-full">
          <LogOut className="size-4" aria-hidden="true" />
          {t("Log out")}
        </Button>
      </form>
    </div>
  );
}
