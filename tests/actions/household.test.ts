import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db";
import { householdInvites, householdMembers, households, users as usersTable } from "@/db/schema";
import {
  acceptHouseholdInvite,
  cancelHouseholdInvite,
  declineHouseholdInvite,
  inviteToHousehold,
  leaveHousehold,
  removeHouseholdMember,
} from "@/lib/actions/household";
import { getHouseholdOverview } from "@/lib/data/household";
import { signInAs, signOut } from "../helpers/auth";
import { redirectTarget } from "../helpers/redirect";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

const sendEmail = vi.hoisted(() => vi.fn(async () => true));
vi.mock("@/lib/email/transport", () => ({ sendEmail }));

const missing = "00000000-0000-4000-8000-000000000000";

describe.skipIf(!TEST_DATABASE_URL)("household actions", () => {
  const users = useTestUsers();
  let ann: { id: string; email: string };
  let ben: { id: string; email: string };
  let cat: { id: string; email: string };
  let dan: { id: string; email: string };

  beforeAll(async () => {
    ann = await users.create({ label: "ann", name: "Ann" });
    ben = await users.create({ label: "ben", name: "Ben" });
    cat = await users.create({ label: "cat", name: "Cat" });
    dan = await users.create({ label: "dan", name: "Dan" });
  });
  afterAll(users.cleanup);
  beforeEach(() => sendEmail.mockClear());
  afterEach(async () => {
    const ids = [ann.id, ben.id, cat.id, dan.id];
    const db = getDb();
    for (const id of ids) {
      await db.delete(householdInvites).where(or(eq(householdInvites.inviterId, id), eq(householdInvites.inviteeId, id)));
    }
    // Only this file's households: other test files run in parallel against the same database.
    const mine = await db.select({ id: householdMembers.householdId }).from(householdMembers).where(inArray(householdMembers.userId, ids));
    if (mine.length) await db.delete(households).where(inArray(households.id, mine.map((row) => row.id)));
  });

  async function inviteAndAccept(from: { id: string; email: string }, to: { id: string; email: string }) {
    await signInAs(from.id);
    expect(await inviteToHousehold({ email: to.email })).toEqual({ ok: true });
    await signInAs(to.id);
    const { incoming } = await getHouseholdOverview();
    const invite = incoming.find((i) => i.inviterName === (from === ann ? "Ann" : from === ben ? "Ben" : "Cat"));
    expect(await acceptHouseholdInvite(invite?.id)).toEqual({ ok: true });
  }

  async function membersOf(userId: string) {
    await signInAs(userId);
    return (await getHouseholdOverview()).members.map((m) => m.name).sort();
  }

  it("requires a signed-in user", async () => {
    signOut();
    expect(await redirectTarget(inviteToHousehold({ email: "x@y.z" }))).toBe("/login");
    expect(await redirectTarget(cancelHouseholdInvite(missing))).toBe("/login");
    expect(await redirectTarget(declineHouseholdInvite(missing))).toBe("/login");
    expect(await redirectTarget(acceptHouseholdInvite(missing))).toBe("/login");
    expect(await redirectTarget(leaveHousehold())).toBe("/login");
    expect(await redirectTarget(removeHouseholdMember(missing))).toBe("/login");
    expect(await redirectTarget(getHouseholdOverview())).toBe("/login");
  });

  describe("invite", () => {
    it("emails an existing user and lists the invite for both sides", async () => {
      await signInAs(ann.id);
      expect(await inviteToHousehold({ email: ` ${ben.email.toUpperCase()} ` })).toEqual({ ok: true });
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: ben.email, subject: expect.stringContaining("Ann") }));
      expect((await getHouseholdOverview()).outgoing).toEqual([{ id: expect.any(String), email: ben.email }]);

      await signInAs(ben.id);
      expect((await getHouseholdOverview()).incoming).toEqual([{ id: expect.any(String), inviterName: "Ann" }]);
    });

    it("answers the same for an unknown email and sends nothing", async () => {
      await signInAs(ann.id);
      expect(await inviteToHousehold({ email: "nobody@test.local" })).toEqual({ ok: true });
      expect(sendEmail).not.toHaveBeenCalled();
      expect((await getHouseholdOverview()).outgoing.map((i) => i.email)).toEqual(["nobody@test.local"]);
    });

    it("validates the email and refuses inviting yourself", async () => {
      await signInAs(ann.id);
      expect(await inviteToHousehold({ email: "nope" })).toMatchObject({ ok: false, fieldErrors: { email: expect.any(Array) } });
      expect(await inviteToHousehold({ email: ann.email })).toMatchObject({ ok: false, fieldErrors: { email: ["You can't invite yourself."] } });
    });

    it("renews instead of duplicating when invited again", async () => {
      await signInAs(ann.id);
      await inviteToHousehold({ email: ben.email });
      await inviteToHousehold({ email: ben.email });
      expect((await getHouseholdOverview()).outgoing).toHaveLength(1);
      expect(sendEmail).toHaveBeenCalledTimes(2);
    });

    it("caps pending invitations", async () => {
      await signInAs(ann.id);
      for (let i = 0; i < 20; i++) expect(await inviteToHousehold({ email: `ghost${i}@test.local` })).toEqual({ ok: true });
      expect(await inviteToHousehold({ email: "ghost-extra@test.local" })).toMatchObject({ ok: false, fieldErrors: { email: expect.any(Array) } });
    });
  });

  describe("cancel and decline", () => {
    it("lets only the inviter cancel", async () => {
      await signInAs(ann.id);
      await inviteToHousehold({ email: ben.email });
      const [invite] = (await getHouseholdOverview()).outgoing;

      await signInAs(cat.id);
      expect(await cancelHouseholdInvite(invite.id)).toMatchObject({ ok: false });
      await signInAs(ben.id);
      expect(await cancelHouseholdInvite(invite.id)).toMatchObject({ ok: false });

      await signInAs(ann.id);
      expect(await cancelHouseholdInvite(invite.id)).toEqual({ ok: true });
      expect((await getHouseholdOverview()).outgoing).toEqual([]);
      expect(await cancelHouseholdInvite("not-an-id")).toMatchObject({ ok: false });
    });

    it("lets only the invitee decline", async () => {
      await signInAs(ann.id);
      await inviteToHousehold({ email: ben.email });
      const [invite] = (await getHouseholdOverview()).outgoing;

      expect(await declineHouseholdInvite(invite.id)).toMatchObject({ ok: false });
      await signInAs(ben.id);
      const [incoming] = (await getHouseholdOverview()).incoming;
      expect(await declineHouseholdInvite(incoming.id)).toEqual({ ok: true });
      expect((await getHouseholdOverview()).incoming).toEqual([]);
      expect(await declineHouseholdInvite("not-an-id")).toMatchObject({ ok: false });
    });
  });

  describe("accept", () => {
    it("creates a household with both people", async () => {
      await inviteAndAccept(ann, ben);
      expect(await membersOf(ann.id)).toEqual(["Ann", "Ben"]);
      expect(await membersOf(ben.id)).toEqual(["Ann", "Ben"]);
      const overview = await getHouseholdOverview();
      expect(overview.members.find((m) => m.isMe)?.name).toBe("Ben");
      expect(overview.incoming).toEqual([]);
    });

    it("adds a third person to the same household and has no member limit", async () => {
      await inviteAndAccept(ann, ben);
      await inviteAndAccept(ben, cat);
      await inviteAndAccept(cat, dan);
      expect(await membersOf(dan.id)).toEqual(["Ann", "Ben", "Cat", "Dan"]);
      expect(await getDb().select().from(householdMembers).where(inArray(householdMembers.userId, [ann.id, ben.id, cat.id, dan.id]))).toHaveLength(4);
    });

    it("never exposes other members' emails", async () => {
      await inviteAndAccept(ann, ben);
      expect(JSON.stringify(await getHouseholdOverview())).not.toContain(ann.email);
    });

    it("rejects strangers, unknown ids and expired invitations", async () => {
      await signInAs(ann.id);
      await inviteToHousehold({ email: ben.email });
      await signInAs(ben.id);
      const [invite] = (await getHouseholdOverview()).incoming;

      await signInAs(cat.id);
      expect(await acceptHouseholdInvite(invite.id)).toMatchObject({ ok: false });
      expect(await acceptHouseholdInvite("not-an-id")).toMatchObject({ ok: false });

      await getDb().update(householdInvites).set({ expiresAt: new Date(Date.now() - 1000) });
      await signInAs(ben.id);
      expect(await acceptHouseholdInvite(invite.id)).toMatchObject({ ok: false });
      expect((await getHouseholdOverview()).incoming).toEqual([]);
      expect((await getHouseholdOverview()).members).toEqual([]);
    });

    it("refuses when I am already in a household", async () => {
      await inviteAndAccept(ann, ben);
      await signInAs(cat.id);
      await inviteToHousehold({ email: ben.email });
      await signInAs(ben.id);
      const [invite] = (await getHouseholdOverview()).incoming;
      expect(await acceptHouseholdInvite(invite.id)).toMatchObject({ ok: false, error: expect.stringContaining("already in a household") });
    });

    it("drops the other invitations once I join", async () => {
      await signInAs(cat.id);
      await inviteToHousehold({ email: ben.email });
      await inviteAndAccept(ann, ben);
      expect((await getHouseholdOverview()).incoming).toEqual([]);
    });

    it("reports a concurrent join as already in a household", async () => {
      await signInAs(ann.id);
      await inviteToHousehold({ email: ben.email });
      await signInAs(ben.id);
      const [invite] = (await getHouseholdOverview()).incoming;
      const [first, second] = await Promise.all([acceptHouseholdInvite(invite.id), acceptHouseholdInvite(invite.id)]);
      expect([first.ok, second.ok].filter(Boolean)).toHaveLength(1);
      expect(await membersOf(ben.id)).toEqual(["Ann", "Ben"]);
    });
  });

  describe("leave and remove", () => {
    it("dissolves a two-person household when one leaves", async () => {
      await inviteAndAccept(ann, ben);
      await signInAs(ben.id);
      expect(await leaveHousehold()).toEqual({ ok: true });
      expect(await membersOf(ben.id)).toEqual([]);
      expect(await membersOf(ann.id)).toEqual([]);
      expect(await getDb().select().from(householdMembers).where(inArray(householdMembers.userId, [ann.id, ben.id]))).toHaveLength(0);
    });

    it("keeps a bigger household together when one person leaves", async () => {
      await inviteAndAccept(ann, ben);
      await inviteAndAccept(ann, cat);
      await signInAs(cat.id);
      expect(await leaveHousehold()).toEqual({ ok: true });
      expect(await membersOf(ann.id)).toEqual(["Ann", "Ben"]);
    });

    it("is a no-op when I am not in a household", async () => {
      await signInAs(dan.id);
      expect(await leaveHousehold()).toEqual({ ok: true });
    });

    it("lets any member remove another member of their household", async () => {
      await inviteAndAccept(ann, ben);
      await inviteAndAccept(ann, cat);
      await signInAs(ben.id);
      expect(await removeHouseholdMember(cat.id)).toEqual({ ok: true });
      expect(await membersOf(ann.id)).toEqual(["Ann", "Ben"]);
      expect(await membersOf(cat.id)).toEqual([]);
    });

    it("refuses removing yourself, strangers, or when not in a household", async () => {
      await inviteAndAccept(ann, ben);
      await signInAs(ann.id);
      expect(await removeHouseholdMember(ann.id)).toMatchObject({ ok: false });
      expect(await removeHouseholdMember(dan.id)).toMatchObject({ ok: false });
      expect(await removeHouseholdMember("not-an-id")).toMatchObject({ ok: false });
      await signInAs(dan.id);
      expect(await removeHouseholdMember(ann.id)).toMatchObject({ ok: false });
      expect(await membersOf(ann.id)).toEqual(["Ann", "Ben"]);
    });
  });

  it("deleting a user removes their membership and dissolves a household left with one person", async () => {
    await inviteAndAccept(ann, ben);
    const extra = await users.create({ label: "temp", name: "Temp" });
    await inviteAndAccept(ann, extra);
    await getDb().delete(usersTable).where(eq(usersTable.id, extra.id));
    expect(await membersOf(ann.id)).toEqual(["Ann", "Ben"]);
  });
});
