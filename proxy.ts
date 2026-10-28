import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// 1. Adds the Content-Security-Policy (with a fresh nonce) to every page response. The other
//    security headers are static and live in next.config.ts.
// 2. Cheap redirects based on cookie PRESENCE only. It never touches the database and never
// proves a session is valid: getCurrentUser() / requireUser() do the real check on the server.

const GUEST_ONLY = ["/login", "/register"];
const PROTECTED = ["/dashboard", "/transactions", "/budgets", "/reports", "/profile", "/admin"];

function matches(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Scripts need the per-request nonce ('strict-dynamic' lets those scripts load their chunks).
 * Styles allow 'unsafe-inline' because React `style` attributes (charts, progress bars) cannot
 * carry a nonce; script injection, the dangerous half, stays blocked.
 */
export function contentSecurityPolicy(nonce: string, options: { dev: boolean; https: boolean }): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (options.https) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = request.cookies.has(SESSION_COOKIE);

  if (hasCookie && GUEST_ONLY.some((path) => matches(pathname, path))) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (!hasCookie && PROTECTED.some((path) => matches(pathname, path))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce, {
    dev: process.env.NODE_ENV === "development",
    https: (process.env.APP_URL ?? "").startsWith("https://"),
  });
  // Next.js reads the nonce from the request's CSP header while rendering and applies it to its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Every page, but not static assets or prefetches (which carry no scripts to protect).
      source: "/((?!_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
