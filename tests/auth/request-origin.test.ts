import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientIpFrom, requestOrigin } from "@/lib/auth/request-origin";
import { requestHeaders } from "../helpers/request-headers";

// The environment is mocked so this does not depend on DATABASE_URL being set (it is not without a test database).
vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe("clientIpFrom", () => {
  it("takes the entry the trusted proxy appended, not what the client claims", () => {
    // A client sending its own X-Forwarded-For only adds entries on the left.
    expect(clientIpFrom("1.2.3.4, 9.9.9.9, 203.0.113.7", 1)).toBe("203.0.113.7");
    expect(clientIpFrom("203.0.113.7", 1)).toBe("203.0.113.7");
  });

  it("counts hops from the right when several proxies are trusted", () => {
    expect(clientIpFrom("1.2.3.4, 203.0.113.7, 10.0.0.1", 2)).toBe("203.0.113.7");
  });

  it("returns null with no header, no trusted proxy, too few entries or a junk value", () => {
    expect(clientIpFrom(null, 1)).toBeNull();
    expect(clientIpFrom("", 1)).toBeNull();
    expect(clientIpFrom("203.0.113.7", 0)).toBeNull();
    expect(clientIpFrom("203.0.113.7", 2)).toBeNull();
    expect(clientIpFrom("not an ip", 1)).toBeNull();
    expect(clientIpFrom("2001:db8::1", 1)).toBe("2001:db8::1");
  });
});

describe("requestOrigin", () => {
  beforeEach(() => requestHeaders.reset());

  it("ignores x-real-ip and a spoofed left side of x-forwarded-for", async () => {
    requestHeaders.set("x-real-ip", "198.51.100.2");
    requestHeaders.set("x-forwarded-for", "6.6.6.6, 203.0.113.7");
    requestHeaders.set("user-agent", "Test Browser");
    expect(await requestOrigin()).toEqual({ ip: "203.0.113.7", userAgent: "Test Browser" });
  });

  it("has no ip when the header is missing, and nothing outside a request", async () => {
    expect(await requestOrigin()).toEqual({ ip: null, userAgent: null });
    requestHeaders.unavailable = true;
    expect(await requestOrigin()).toEqual({ ip: null, userAgent: null });
  });
});
