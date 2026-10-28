import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { tags, transactionTags, transactions } from "@/db/schema";
import { createTag, deleteTag, updateTag } from "@/lib/actions/tags";
import { defaultAccountId } from "../helpers/data";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("tag actions", () => {
  const users = useTestUsers();
  let alice: { id: string };
  let bob: { id: string };

  beforeAll(async () => {
    alice = await users.create({ label: "alice" });
    bob = await users.create({ label: "bob" });
  });
  afterAll(users.cleanup);

  async function find(userId: string, name: string) {
    const [row] = await getDb().select().from(tags).where(and(eq(tags.userId, userId), eq(tags.name, name)));
    return row;
  }

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(createTag({ name: "x" }))).toBe("/login");
    expect(await redirectTarget(updateTag(missing, { name: "x" }))).toBe("/login");
    expect(await redirectTarget(deleteTag(missing))).toBe("/login");
  });

  it("creates a tag for the current user", async () => {
    await signInAs(alice.id);
    expect(await createTag({ name: "  vacation " })).toEqual({ ok: true });
    expect(await find(alice.id, "vacation")).toMatchObject({ userId: alice.id });
  });

  it("validates the name", async () => {
    await signInAs(alice.id);
    expect(await createTag({ name: "" })).toMatchObject({ ok: false, fieldErrors: { name: expect.any(Array) } });
  });

  it("refuses duplicate names (any case) for the same user but allows them for others", async () => {
    await signInAs(alice.id);
    expect(await createTag({ name: "VACATION" })).toMatchObject({
      ok: false,
      error: "A tag with this name already exists.",
      fieldErrors: { name: [expect.any(String)] },
    });
    await signInAs(bob.id);
    expect(await createTag({ name: "vacation" })).toEqual({ ok: true });
  });

  it("renames a tag and reports collisions", async () => {
    await signInAs(alice.id);
    await createTag({ name: "work" });
    const vacation = await find(alice.id, "vacation");
    expect(await updateTag(vacation.id, { name: "holiday" })).toEqual({ ok: true });
    expect((await find(alice.id, "holiday")).id).toBe(vacation.id);
    expect(await updateTag(vacation.id, { name: "WORK" })).toMatchObject({ ok: false, fieldErrors: { name: [expect.any(String)] } });
    expect(await updateTag(vacation.id, { name: "" })).toMatchObject({ ok: false });
  });

  it("cannot rename or delete another user's tag (tampered id)", async () => {
    await signInAs(alice.id);
    const bobsTag = await find(bob.id, "vacation");
    expect(await updateTag(bobsTag.id, { name: "hacked" })).toMatchObject({ ok: false, error: "This item no longer exists." });
    expect(await deleteTag(bobsTag.id)).toMatchObject({ ok: false, error: "This item no longer exists." });
    expect(await find(bob.id, "vacation")).toBeDefined();
  });

  it("treats malformed or unknown ids as not found", async () => {
    await signInAs(alice.id);
    expect(await updateTag("nope", { name: "x" })).toMatchObject({ ok: false });
    expect(await deleteTag("nope")).toMatchObject({ ok: false });
    expect(await updateTag(missing, { name: "x" })).toMatchObject({ ok: false });
    expect(await deleteTag(missing)).toMatchObject({ ok: false });
  });

  it("deleting a tag detaches it from transactions but keeps the transactions", async () => {
    await signInAs(alice.id);
    const work = await find(alice.id, "work");
    const [txn] = await getDb()
      .insert(transactions)
      .values({ userId: alice.id, accountId: await defaultAccountId(alice.id), type: "expense", amount: "3.00", date: "2026-01-02" })
      .returning({ id: transactions.id });
    await getDb().insert(transactionTags).values({ transactionId: txn.id, tagId: work.id });

    expect(await deleteTag(work.id)).toEqual({ ok: true });
    expect(await find(alice.id, "work")).toBeUndefined();
    expect(await getDb().select().from(transactionTags).where(eq(transactionTags.transactionId, txn.id))).toHaveLength(0);
    expect(await getDb().select().from(transactions).where(eq(transactions.id, txn.id))).toHaveLength(1);
  });
});
