import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config, contentSecurityPolicy } from "@/proxy";
import { SESSION_COOKIE } from "@/lib/auth/constants";

function run(path: string, withCookie: boolean) {
  const headers = withCookie ? { cookie: `${SESSION_COOKIE}=anything` } : undefined;
  const response = proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
  return { status: response.status, location: response.headers.get("location") };
}

describe("proxy", () => {
  it("sends logged-out users away from app routes", () => {
    for (const path of ["/dashboard", "/transactions", "/budgets", "/reports", "/reports/cash-flow", "/profile", "/profile/settings", "/admin", "/admin/users"]) {
      expect(run(path, false)).toEqual({ status: 307, location: "http://localhost:3000/login" });
    }
  });

  it("sends users with a session cookie away from /login and /register", () => {
    for (const path of ["/login", "/register"]) {
      expect(run(path, true)).toEqual({ status: 307, location: "http://localhost:3000/dashboard" });
    }
  });

  it("lets everything else through", () => {
    expect(run("/dashboard", true).location).toBeNull();
    expect(run("/profile/tags", true).location).toBeNull();
    expect(run("/login", false).location).toBeNull();
    expect(run("/register", false).location).toBeNull();
    expect(run("/forgot-password", true).location).toBeNull();
    expect(run("/reset-password", true).location).toBeNull();
    expect(run("/verify-email", false).location).toBeNull();
  });

  it("does not match lookalike paths", () => {
    expect(run("/dashboards", false).location).toBeNull();
    expect(run("/loginx", true).location).toBeNull();
  });

  it("runs on pages but not on static assets or prefetches", () => {
    const [entry] = config.matcher;
    expect(entry.source).toContain("_next/static");
    expect(entry.missing).toEqual([
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ]);
  });

  it("sets a nonce-based Content-Security-Policy on every page", () => {
    const first = new NextRequest("http://localhost:3000/login");
    const second = new NextRequest("http://localhost:3000/login");
    const a = proxy(first).headers.get("content-security-policy") ?? "";
    const b = proxy(second).headers.get("content-security-policy") ?? "";
    expect(a).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(a).toContain("frame-ancestors 'none'");
    expect(a).toContain("object-src 'none'");
    expect(a).not.toBe(b); // a fresh nonce per request
  });
});

describe("contentSecurityPolicy", () => {
  it("allows eval only in development and upgrades to https only when the app is served over https", () => {
    const dev = contentSecurityPolicy("n", { dev: true, https: false });
    const prod = contentSecurityPolicy("n", { dev: false, https: true });
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).not.toContain("upgrade-insecure-requests");
    expect(prod).not.toContain("'unsafe-eval'");
    expect(prod).toContain("upgrade-insecure-requests");
  });
});
