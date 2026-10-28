import { toCsv, zipFiles, type ZipEntry } from "@/lib/data/csv";
import type { buildUserExport } from "@/lib/data/admin-export";

type UserExport = NonNullable<Awaited<ReturnType<typeof buildUserExport>>>;

const joinTags = (names: readonly string[]) => names.join("; ");

/** One CSV per kind of data. Column names match the keys of the export data. */
export function userExportCsvFiles(data: UserExport): ZipEntry[] {
  const { profile, household } = data;
  return [
    {
      name: "profile.csv",
      content: toCsv(
        ["id", "name", "email", "currency", "timezone", "emailVerifiedAt", "createdAt", "exportedAt"],
        [
          [
            profile.id, profile.name, profile.email, profile.currency, profile.timezone,
            profile.emailVerifiedAt, profile.createdAt, data.exportedAt,
          ],
        ],
      ),
    },
    {
      name: "household.csv",
      content: toCsv(
        ["member", "joinedAt"],
        (household?.members ?? []).map((member) => [member, household?.joinedAt]),
      ),
    },
    {
      name: "accounts.csv",
      content: toCsv(
        ["id", "name", "type", "initialBalance", "color", "icon", "createdAt"],
        data.accounts.map((r) => [r.id, r.name, r.type, r.initialBalance, r.color, r.icon, r.createdAt]),
      ),
    },
    {
      name: "categories.csv",
      content: toCsv(
        ["id", "type", "name", "color", "icon", "createdAt"],
        data.categories.map((r) => [r.id, r.type, r.name, r.color, r.icon, r.createdAt]),
      ),
    },
    {
      name: "tags.csv",
      content: toCsv(
        ["id", "name", "createdAt"],
        data.tags.map((r) => [r.id, r.name, r.createdAt]),
      ),
    },
    {
      name: "transactions.csv",
      content: toCsv(
        ["id", "date", "type", "amount", "account", "category", "tags", "note", "recurringDate", "createdAt"],
        data.transactions.map((r) => [
          r.id, r.date, r.type, r.amount, r.account, r.category, joinTags(r.tags), r.note, r.recurringDate, r.createdAt,
        ]),
      ),
    },
    {
      name: "transfers.csv",
      content: toCsv(
        ["id", "date", "amount", "fromAccount", "toAccount", "note", "recurringDate", "createdAt"],
        data.transfers.map((r) => [r.id, r.date, r.amount, r.fromAccount, r.toAccount, r.note, r.recurringDate, r.createdAt]),
      ),
    },
    {
      name: "budgets.csv",
      content: toCsv(
        ["id", "category", "amount", "period", "createdAt"],
        data.budgets.map((r) => [r.id, r.category, r.amount, r.period, r.createdAt]),
      ),
    },
    {
      name: "recurring_rules.csv",
      content: toCsv(
        [
          "id", "kind", "amount", "account", "category", "fromAccount", "toAccount", "tags", "note", "frequency",
          "intervalCount", "startDate", "endDate", "nextDueDate", "status", "pausedReason", "createdAt",
        ],
        data.recurringRules.map((r) => [
          r.id, r.kind, r.amount, r.account, r.category, r.fromAccount, r.toAccount, joinTags(r.tags), r.note,
          r.frequency, r.intervalCount, r.startDate, r.endDate, r.nextDueDate, r.status, r.pausedReason, r.createdAt,
        ]),
      ),
    },
  ];
}

export function userExportZip(data: UserExport): Buffer {
  return zipFiles(userExportCsvFiles(data), data.exportedAt);
}
