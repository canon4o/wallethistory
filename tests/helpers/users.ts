import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import type { CurrencyCode } from "@/lib/currencies";
import { createUser } from "@/lib/auth/users";

/** Creates uniquely-named users and deletes them (and, by cascade, all their data) afterwards. */
export function useTestUsers() {
  const ids: string[] = [];

  async function create(
    options: {
      name?: string;
      password?: string;
      verified?: boolean;
      label?: string;
      currency?: CurrencyCode;
      timezone?: string;
    } = {},
  ) {
    const email = `${options.label ?? "user"}-${crypto.randomUUID()}@test.local`;
    const password = options.password ?? "password123";
    const result = await createUser({
      name: options.name ?? "Test User",
      email,
      password,
      verified: options.verified ?? true,
      currency: options.currency,
      timezone: options.timezone,
    });
    if (!result.ok) throw new Error("could not create test user");
    ids.push(result.id);
    return { id: result.id, email, password };
  }

  async function cleanup() {
    if (ids.length) await getDb().delete(users).where(inArray(users.id, ids));
    ids.length = 0;
  }

  return { create, cleanup };
}

export async function getUserRow(id: string) {
  const [row] = await getDb().select().from(users).where(eq(users.id, id));
  return row;
}
