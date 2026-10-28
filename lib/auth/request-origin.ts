import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

const MAX_USER_AGENT_LENGTH = 300;
// Only characters an IPv4/IPv6 address can contain, so a spoofed value never ends up in keys or logs.
const IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The client IP from X-Forwarded-For. Every proxy appends the address it received the request
 * from, so only the entries on the right were added by infrastructure we trust; anything on the
 * left is whatever the client sent. With `hops` trusted proxies the client is `hops` places from
 * the right. Fewer entries than that means the request did not come through them: no IP.
 */
export function clientIpFrom(forwardedFor: string | null | undefined, hops: number): string | null {
  if (hops < 1 || !forwardedFor) return null;
  const entries = forwardedFor.split(",").map((entry) => entry.trim());
  const ip = entries[entries.length - hops];
  return ip && IP_PATTERN.test(ip) ? ip : null;
}

/** IP and browser of the current request, for the login log, the session list and rate limits. */
export async function requestOrigin(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const requestHeaders = await headers();
    const ip = clientIpFrom(requestHeaders.get("x-forwarded-for"), getEnv().TRUSTED_PROXY_HOPS);
    const userAgent = requestHeaders.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH);
    return { ip, userAgent: userAgent || null };
  } catch {
    return { ip: null, userAgent: null };
  }
}
