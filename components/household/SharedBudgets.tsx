import { CategoryBadge } from "@/components/categories/CategoryIcon";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { SharedBudget } from "@/lib/data/budgets";
import type { CurrencyCode } from "@/lib/currencies";
import { formatMoney } from "@/lib/format";
import { getT } from "@/lib/i18n/server";

/** Household members' budgets, grouped by person. Read-only: no edit or delete. */
export async function SharedBudgets({ budgets, currency }: { budgets: SharedBudget[]; currency: CurrencyCode }) {
  const t = await getT();
  if (budgets.length === 0) return null;
  const byOwner = new Map<string, { name: string; items: SharedBudget[] }>();
  for (const budget of budgets) {
    const group = byOwner.get(budget.ownerId) ?? { name: budget.ownerName, items: [] };
    group.items.push(budget);
    byOwner.set(budget.ownerId, group);
  }
  return (
    <section aria-label={t("Household budgets")} className="mt-6 flex flex-col gap-4">
      <h2 className="text-base font-bold">{t("Household budgets")}</h2>
      {[...byOwner.entries()].map(([ownerId, group]) => (
        <div key={ownerId} className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted">{group.name} {t("(read-only)")}</h3>
          <ul className="flex flex-col gap-2">
            {group.items.map((budget) => {
              const spent = Number(budget.spent);
              const limit = Number(budget.amount);
              const over = Number(budget.remaining) < 0;
              return (
                <li key={budget.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-surface p-3">
                  <div className="flex items-center gap-2">
                    <CategoryBadge icon={budget.category.icon} color={budget.category.color} />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">{budget.category.name}</span>
                    <Badge>{budget.period === "weekly" ? t("Weekly") : t("Monthly")}</Badge>
                  </div>
                  <ProgressBar
                    value={spent}
                    max={limit}
                    label={
                      budget.period === "weekly"
                        ? t("{owner}'s {category} weekly budget used", { owner: group.name, category: budget.category.name })
                        : t("{owner}'s {category} monthly budget used", { owner: group.name, category: budget.category.name })
                    }
                  />
                  <p className={`text-xs tabular-nums ${over ? "font-semibold text-expense-text" : "text-muted"}`}>
                    {formatMoney(spent, currency)} {t("of")} {formatMoney(limit, currency)}
                    {over ? ` · ${t("over by {amount}", { amount: formatMoney(Math.abs(Number(budget.remaining)), currency) })}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
