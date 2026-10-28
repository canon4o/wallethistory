import { AccountBadge } from "@/components/accounts/AccountIcon";
import { Badge } from "@/components/ui/Badge";
import { ACCOUNT_TYPE_LABELS } from "@/lib/account-types";
import type { SharedAccount } from "@/lib/data/accounts";
import type { CurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

/** Household members' accounts, grouped by person. Read-only: no edit or delete. */
export async function SharedAccounts({ accounts, currency }: { accounts: SharedAccount[]; currency: CurrencyCode }) {
  const t = await getT();
  if (accounts.length === 0) return null;
  const byOwner = new Map<string, { name: string; items: SharedAccount[] }>();
  for (const account of accounts) {
    const group = byOwner.get(account.ownerId) ?? { name: account.ownerName, items: [] };
    group.items.push(account);
    byOwner.set(account.ownerId, group);
  }
  return (
    <section aria-label={t("Household accounts")} className="mt-6 flex flex-col gap-4">
      <h2 className="text-base font-bold">{t("Household accounts")}</h2>
      {[...byOwner.entries()].map(([ownerId, group]) => (
        <div key={ownerId} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted">{group.name} {t("(read-only)")}</h3>
          <ul className="flex flex-col gap-2">
            {group.items.map((account) => (
              <li key={account.id} className="flex items-center gap-2 rounded-lg border border-border bg-surface p-3">
                <AccountBadge icon={account.icon} color={account.color} />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <p className="max-w-full truncate text-sm font-bold">{account.name}</p>
                  <Badge tone="accounts">{t(ACCOUNT_TYPE_LABELS[account.type])}</Badge>
                </div>
                <p className={`text-sm font-bold tabular-nums ${Number(account.balance) < 0 ? "text-expense-text" : ""}`}>
                  {formatMoney(Number(account.balance), currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
