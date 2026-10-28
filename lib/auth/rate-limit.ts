import { createHash } from "node:crypto";
import { and, count, gt, inArray, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { loginEvents } from "@/db/schema";
import { countHit } from "@/lib/cache";
import { requestOrigin } from "./request-origin";

// Throttles for the public auth actions. Two layers:
//  - Account lockout: after too many failed logins for one email, further attempts are refused for a
//    while. It counts rows already in login_events, so it works without Redis and survives restarts.
//  - Request limits (per IP, and per email for emails we send): fixed-window counters in the cache.
//    If the cache is off or down they let everything through; they are a brake, not a gate.

export const LOCKOUT_MAX_FAILURES = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

type Limit = { limit: number; windowSeconds: number };

const MINUTE = 60;
const HOUR = 60 * MINUTE;

export const LIMITS = {
  login: { limit: 30, windowSeconds: LOCKOUT_WINDOW_MINUTES * MINUTE },
  register: { limit: 10, windowSeconds: HOUR },
  forgotPassword: { limit: 5, windowSeconds: HOUR },
  resendVerification: { limit: 5, windowSeconds: HOUR },
} as const satisfies Record<string, Limit>;

/** Per-email limit for the actions that send an email, so one inbox cannot be flooded. */
export const EMAIL_LIMIT = { limit: 3, windowSeconds: HOUR } as const satisfies Limit;

export type LimitedAction = keyof typeof LIMITS;

const emailKey = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 32);

async function exceeded(name: string, subject: string, { limit, windowSeconds }: Limit): Promise<boolean> {
  const hits = await countHit(name, subject, windowSeconds);
  return hits !== undefined && hits > limit;
}

/**
 * Counts this request against the per-IP limit of `action` (and the per-email limit when `email`
 * is given) and returns true when it must be refused. Unknown IPs are not limited per IP.
 */
export async function isRateLimited(action: LimitedAction, email?: string): Promise<boolean> {
  const { ip } = await requestOrigin();
  if (ip && (await exceeded(`${action}:ip`, ip, LIMITS[action]))) return true;
  if (email && (await exceeded(`${action}:email`, emailKey(email), EMAIL_LIMIT))) return true;
  return false;
}

/** True when `email` has too many recent failed logins. The same for known and unknown emails. */
export async function isLockedOut(email: string): Promise<boolean> {
  const since = new Date(Date.now() - LOCKOUT_WINDOW_MINUTES * MINUTE * 1000);
  const [{ failures }] = await getDb()
    .select({ failures: count() })
    .from(loginEvents)
    .where(
      and(
        eq(loginEvents.emailAttempted, email.toLowerCase()),
        eq(loginEvents.success, false),
        // Blocked and unverified logins had the right password; they say nothing about guessing.
        inArray(loginEvents.reason, ["bad_password", "unknown_email"]),
        gt(loginEvents.createdAt, since),
      ),
    );
  return failures >= LOCKOUT_MAX_FAILURES;
}
