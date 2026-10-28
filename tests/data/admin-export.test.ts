import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  adminAuditLog,
  budgets,
  householdMembers,
  households,
  recurringRuleTags,
  recurringRules,
  tags,
  transactionTags,
  transactions,
  transfers,
  users as usersTable,
} from "@/db/schema";
import { POST } from "@/app/(app)/admin/users/[id]/export/route";
import { buildUserExport } from "@/lib/data/admin-export";
import { userExportCsvFiles } from "@/lib/data/admin-export-files";
import { inflateRawSync } from "node:zlib";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

function post(userId: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new URLSearchParams(fields);
  return POST(
    new Request(`http://localhost/admin/users/${userId}/export`, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    }),
    { params: Promise.resolve({ id: userId }) } as never,
  );
}

describe.skipIf(!TEST_DATABASE_URL)("user data export", () => {
  const users = useTestUsers();
  let admin: { id: string; email: string };
  let ann: { id: string; email: string };
  let ben: { id: string; email: string };
  let householdId: string;

  beforeAll(async () => {
    admin = await users.create({ label: "admin" });
    ann = await users.create({ label: "ann", name: "Ann Export" });
    ben = await users.create({ label: "ben", name: "Ben Partner" });
    await getDb().update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, admin.id));

    const annAccount = await defaultAccountId(ann.id);
    const benAccount = await defaultAccountId(ben.id);
    const [txn] = await getDb()
      .insert(transactions)
      .values({
        userId: ann.id,
        accountId: annAccount,
        categoryId: await categoryIdByName(ann.id, "Groceries"),
        type: "expense",
        amount: "12.34",
        date: "2026-10-01",
        note: "weekly shop",
      })
      .returning({ id: transactions.id });
    const [tag] = await getDb().insert(tags).values({ userId: ann.id, name: "food" }).returning({ id: tags.id });
    await getDb().insert(transactionTags).values({ transactionId: txn.id, tagId: tag.id });
    const [rule] = await getDb()
      .insert(recurringRules)
      .values({
        userId: ann.id,
        kind: "expense",
        amount: "700.00",
        accountId: annAccount,
        categoryId: await categoryIdByName(ann.id, "Groceries"),
        note: "rent",
        frequency: "monthly",
        startDate: "2026-09-01",
        nextDueDate: "2026-11-01",
      })
      .returning({ id: recurringRules.id });
    await getDb().insert(recurringRuleTags).values({ ruleId: rule.id, tagId: tag.id });

    await getDb().insert(budgets).values({ userId: ann.id, categoryId: await categoryIdByName(ann.id, "Groceries"), amount: "200.00" });
    await getDb().insert(transactions).values({
      userId: ben.id,
      accountId: benAccount,
      type: "expense",
      amount: "99.99",
      date: "2026-10-02",
      note: "ben secret",
    });
    const [household] = await getDb().insert(households).values({}).returning();
    householdId = household.id;
    await getDb().insert(householdMembers).values([
      { householdId, userId: ann.id },
      { householdId, userId: ben.id },
    ]);
    await getDb().insert(transfers).values({
      userId: ann.id,
      fromAccountId: annAccount,
      toAccountId: benAccount,
      amount: "20.00",
      date: "2026-10-03",
    });    await getDb().insert(recurringRules).values({
      userId: ann.id,
      kind: "transfer",
      amount: "30.00",
      fromAccountId: annAccount,
      toAccountId: benAccount,
      frequency: "weekly",
      intervalCount: 2,
      startDate: "2026-09-01",
      nextDueDate: "2026-11-02",
    });
  });
  beforeEach(async () => {
    await getDb().delete(adminAuditLog).where(eq(adminAuditLog.actorId, admin.id));
    await signInAs(admin.id);
  });
  afterAll(async () => {
    await getDb().delete(households).where(eq(households.id, householdId));
    await users.cleanup();
  });

  describe("buildUserExport", () => {
    it("contains the user's rows with readable names and nothing from other users", async () => {
      const data = await buildUserExport(ann.id);
      expect(data?.profile).toMatchObject({ name: "Ann Export", email: ann.email });
      expect(data?.transactions).toHaveLength(1);
      expect(data?.transactions[0]).toMatchObject({
        amount: "12.34",
        note: "weekly shop",
        account: "Cash",
        category: "Groceries",
        tags: ["food"],
      });
      expect(data?.budgets[0]).toMatchObject({ amount: "200.00", category: "Groceries" });
      expect(data?.tags.map((t) => t.name)).toEqual(["food"]);
      expect(data?.household?.members).toEqual(["Ann Export", "Ben Partner"]);
      expect(JSON.stringify(data)).not.toMatch(/99\.99|ben secret|passwordHash|tokenHash|\$2[aby]\$/);
    });

    it("names only the user's own accounts in transfers", async () => {
      const data = await buildUserExport(ann.id);
      expect(data?.transfers).toHaveLength(1);
      expect(data?.transfers[0]).toMatchObject({
        amount: "20.00",
        fromAccount: "Cash",
        toAccount: "An account of a household member",
      });
    });

    it("includes recurring rules with readable names, and none of a partner's", async () => {
      await getDb().insert(recurringRules).values({
        userId: ben.id,
        kind: "expense",
        amount: "55.55",
        accountId: await defaultAccountId(ben.id),
        frequency: "daily",
        startDate: "2026-09-01",
        nextDueDate: "2026-09-01",
        note: "ben rule",
      });
      const data = await buildUserExport(ann.id);
      expect(data?.recurringRules).toHaveLength(2);
      expect(data?.recurringRules[0]).toMatchObject({
        kind: "expense",
        amount: "700.00",
        account: "Cash",
        category: "Groceries",
        tags: ["food"],
        frequency: "monthly",
        intervalCount: 1,
        status: "active",
      });
      expect(data?.recurringRules[1]).toMatchObject({
        kind: "transfer",
        fromAccount: "Cash",
        toAccount: "An account of a household member",
        account: null,
        category: null,
        intervalCount: 2,
      });
      expect(JSON.stringify(data)).not.toMatch(/55\.55|ben rule/);
      await getDb().delete(recurringRules).where(eq(recurringRules.userId, ben.id));
    });

    it("has an empty household for someone outside one, and null for an unknown user", async () => {
      const loner = await users.create();
      expect((await buildUserExport(loner.id))?.household).toBeNull();
      expect(await buildUserExport(crypto.randomUUID())).toBeNull();
    });
  });

  describe("CSV files", () => {
    it("has one file per kind of data, including recurring rules, with tags joined", async () => {
      const data = await buildUserExport(ann.id);
      const files = new Map(userExportCsvFiles(data!).map((f) => [f.name, f.content]));
      expect([...files.keys()]).toEqual([
        "profile.csv", "household.csv", "accounts.csv", "categories.csv", "tags.csv",
        "transactions.csv", "transfers.csv", "budgets.csv", "recurring_rules.csv",
      ]);
      expect(files.get("transactions.csv")).toContain(",12.34,Cash,Groceries,food,weekly shop,");
      expect(files.get("recurring_rules.csv")).toContain("expense,700.00,Cash,Groceries");
      expect(files.get("household.csv")).toContain("Ben Partner");
      expect(files.get("profile.csv")?.split("\r\n")[0]).toContain("email,currency,timezone,emailVerifiedAt");
      expect(files.get("profile.csv")).toContain(`${ann.email},USD,UTC,`);
      expect(files.get("transfers.csv")).toContain("An account of a household member");
    });

    it("writes only a header for a user without a household", async () => {
      const loner = await users.create();
      const files = new Map(userExportCsvFiles((await buildUserExport(loner.id))!).map((f) => [f.name, f.content]));
      expect(files.get("household.csv")).toBe("\uFEFFmember,joinedAt\r\n");
    });
  });

  describe("export route", () => {
    it("downloads the user's data as a zip of CSV files and records who exported whose data and why", async () => {
      const response = await post(ann.id, { reason: "User asked by email" });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/zip");
      expect(response.headers.get("content-disposition")).toMatch(/^attachment; filename="wallethistory-export-.*\.zip"$/);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const files = readZip(Buffer.from(await response.arrayBuffer()));
      expect([...files.keys()]).toContain("transactions.csv");
      expect(files.get("profile.csv")).toContain(ann.email);
      expect(files.get("transactions.csv")).toContain("weekly shop");
      expect(files.get("transactions.csv")).not.toContain("ben secret");

      const [entry] = await getDb()
        .select()
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.actorId, admin.id), eq(adminAuditLog.action, "data_exported")));
      expect(entry).toMatchObject({ targetUserId: ann.id, targetEmail: ann.email, detail: { reason: "User asked by email" } });
      expect(JSON.stringify(entry)).not.toMatch(/12\.34|weekly shop/);
    });

    it("needs a reason and writes no audit row when it refuses", async () => {
      expect((await post(ann.id, { reason: "  " })).status).toBe(400);
      expect((await post(ann.id, { reason: "x".repeat(301) })).status).toBe(400);
      expect((await post(ann.id, {})).status).toBe(400);
      expect(await getDb().select().from(adminAuditLog).where(eq(adminAuditLog.actorId, admin.id))).toHaveLength(0);
    });

    it("answers 404 for an unknown or malformed user", async () => {
      await expect(post(crypto.randomUUID(), { reason: "because" })).rejects.toMatchObject({
        digest: expect.stringContaining("404"),
      });
      expect((await post("not-a-uuid", { reason: "because" })).status).toBe(400);
    });

    it("refuses a request from another origin", async () => {
      const response = await post(ann.id, { reason: "because" }, { origin: "https://evil.example" });
      expect(response.status).toBe(403);
      expect(await getDb().select().from(adminAuditLog).where(eq(adminAuditLog.actorId, admin.id))).toHaveLength(0);
    });

    it("accepts a request from its own origin", async () => {
      expect((await post(ann.id, { reason: "because" }, { origin: "http://localhost" })).status).toBe(200);
    });

    it("limits an admin to five exports per hour", async () => {
      for (let i = 0; i < 5; i++) expect((await post(ann.id, { reason: "again" })).status).toBe(200);
      expect((await post(ann.id, { reason: "again" })).status).toBe(429);
    });

    it("gives nothing to a regular user or a visitor", async () => {
      const regular = await users.create();
      await signInAs(regular.id);
      await expect(post(ann.id, { reason: "because" })).rejects.toMatchObject({ digest: expect.stringContaining("404") });
      signOut();
      expect(await redirectTarget(post(ann.id, { reason: "because" }))).toBe("/login");
      expect(await getDb().select().from(adminAuditLog).where(eq(adminAuditLog.actorId, admin.id))).toHaveLength(0);
    });
  });
});

/** Reads the stored entries of a zip written by zipFiles. */
function readZip(buffer: Buffer): Map<string, string> {
  const files = new Map<string, string>();
  let pos = 0;
  while (buffer.readUInt32LE(pos) === 0x04034b50) {
    const size = buffer.readUInt32LE(pos + 18);
    const nameLength = buffer.readUInt16LE(pos + 26);
    const name = buffer.subarray(pos + 30, pos + 30 + nameLength).toString("utf8");
    const data = buffer.subarray(pos + 30 + nameLength, pos + 30 + nameLength + size);
    files.set(name, inflateRawSync(data).toString("utf8"));
    pos += 30 + nameLength + size;
  }
  return files;
}
