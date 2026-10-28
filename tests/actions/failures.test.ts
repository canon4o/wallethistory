import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAccount, deleteAccount, updateAccount } from "@/lib/actions/accounts";
import { createCategory, deleteCategory, updateCategory } from "@/lib/actions/categories";
import { createBudget, deleteBudget, updateBudget } from "@/lib/actions/budgets";
import { createTag, deleteTag, updateTag } from "@/lib/actions/tags";
import { createTransaction, deleteTransaction, updateTransaction } from "@/lib/actions/transactions";
import { changePassword, deleteCurrentUser, updateProfile } from "@/lib/actions/users";
import { verifyEmail } from "@/lib/actions/auth";
import { GENERIC_ERROR } from "@/lib/actions/result";
import { createAuthToken } from "@/lib/auth/tokens";
import { categoryIdByName, defaultAccountId } from "../helpers/data";
import { signInAs } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

// Failure injection: while `inject.dbError` is set, every WRITE built through getDb() rejects.
// Reads still work, so the session check (requireUser) keeps passing and only the action's write fails.
const inject = vi.hoisted(() => ({
  dbError: null as Error | null,
  userMissing: false,
}));

vi.mock("@/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db")>();
  const failing: unknown = new Proxy(function () {}, {
    get: (_target, property) =>
      property === "then" ? (_resolve: unknown, reject: (e: Error) => void) => reject(inject.dbError as Error) : failing,
    apply: () => failing,
  });
  const writes = new Set(["insert", "update", "delete", "transaction"]);
  return {
    ...actual,
    getDb: () => {
      const real = actual.getDb();
      if (!inject.dbError) return real;
      return new Proxy(real, {
        get(target, property) {
          if (writes.has(String(property))) return failing;
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    },
  };
});

vi.mock("@/lib/auth/users", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/users")>();
  return { ...actual, findUserById: async (id: string) => (inject.userMissing ? null : actual.findUserById(id)) };
});

const id = "00000000-0000-4000-8000-000000000000";
const SECRET = 'relation "secret_table" does not exist (password=hunter2)';

describe.skipIf(!TEST_DATABASE_URL)("unexpected failures never leak raw errors", () => {
  const users = useTestUsers();
  let user: { id: string; password: string };
  let accountId = "";
  let expenseCategoryId = "";

  beforeAll(async () => {
    user = await users.create();
    await signInAs(user.id);
    accountId = await defaultAccountId(user.id);
    expenseCategoryId = await categoryIdByName(user.id, "Rent");
  });
  afterEach(() => {
    inject.dbError = null;
    inject.userMissing = false;
  });
  afterAll(users.cleanup);

  const transactionInput = () => ({
    type: "expense",
    amount: "1",
    date: "2026-01-01",
    accountId,
    categoryId: "",
    tagIds: [],
    note: "",
  });

  const calls: Array<[string, () => Promise<unknown>]> = [
    ["createAccount", () => createAccount({ name: "A", type: "cash", color: "#9cca56", icon: "banknote", initialBalance: "0" })],
    ["updateAccount", () => updateAccount(id, { name: "A", type: "cash", color: "#9cca56", icon: "banknote", initialBalance: "0" })],
    ["deleteAccount", () => deleteAccount(id)],
    ["createCategory", () => createCategory({ type: "expense", name: "A", color: "#1aaaba", icon: "tag" })],
    ["updateCategory", () => updateCategory(id, { name: "A", color: "#1aaaba", icon: "tag" })],
    ["deleteCategory", () => deleteCategory(id)],
    ["createTag", () => createTag({ name: "A" })],
    ["updateTag", () => updateTag(id, { name: "A" })],
    ["deleteTag", () => deleteTag(id)],
    ["updateProfile", () => updateProfile({ name: "A" })],
    ["createTransaction", () => createTransaction(transactionInput())],
    ["updateTransaction", () => updateTransaction(id, transactionInput())],
    ["deleteTransaction", () => deleteTransaction(id)],
    ["createBudget", () => createBudget({ categoryId: expenseCategoryId, amount: "5", period: "monthly" })],
    ["updateBudget", () => updateBudget(id, { categoryId: expenseCategoryId, amount: "5", period: "monthly" })],
    ["deleteBudget", () => deleteBudget(id)],
  ];

  it.each(calls)("%s returns a generic error and logs the cause", async (_name, run) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    inject.dbError = new Error(SECRET);
    const result = await run();
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR });
    expect(JSON.stringify(result)).not.toContain("secret_table");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("reports a missing user row (deleted mid-request) as not found", async () => {
    inject.userMissing = true;
    const expected = { ok: false, error: "This item no longer exists." };
    expect(await changePassword({ currentPassword: user.password, newPassword: "other-pass-123", confirmPassword: "other-pass-123" })).toEqual(expected);
    expect(await deleteCurrentUser({ password: user.password })).toEqual(expected);
  });

  it("verifyEmail still succeeds when the user cannot be loaded for the welcome email", async () => {
    const other = await users.create({ verified: false });
    const token = await createAuthToken(other.id, "email_verification");
    inject.userMissing = true;
    expect(await verifyEmail(token)).toEqual({ ok: true });
  });
});
