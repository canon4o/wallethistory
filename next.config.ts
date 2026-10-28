import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

// Remote dev (GitHub Codespaces): the app is opened through a forwarded URL such as
// https://<codespace>-3000.app.github.dev, or through localhost with the proxy adding that
// host in x-forwarded-host. Next.js rejects the mismatch as "Invalid Server Actions request".
// Both values below come from the environment Codespaces provides, nothing is hardcoded.
// Wildcards cover any forwarded port and keep working when the env vars are missing
// (for example a dev server started outside the Codespace terminal).
const codespaceDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ?? "app.github.dev";
const codespaceHosts = [`*.${codespaceDomain}`];

// `next start` inside a Codespace is still behind the forwarding proxy (origin localhost:3000,
// x-forwarded-host *.app.github.dev). CODESPACES=true is set only there, so a real production
// deployment elsewhere keeps the strict same-origin check.
const allowProxyHosts = !isProduction || process.env.CODESPACES === "true";

// Static security headers for every response. The Content-Security-Policy needs a per-request
// nonce, so it is set in proxy.ts instead.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS only in production: browsers remember it per host, and dev runs over plain http.
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000" }]
    : []),
];

const nextConfig: NextConfig = {
  // Self-contained server.js for the Docker image (see Dockerfile). Vercel ignores it.
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Dev server assets and HMR requested from the forwarded host (hostname only, no port).
  allowedDevOrigins: isProduction ? [] : codespaceHosts,
  experimental: {
    serverActions: {
      // Development and Codespaces only: other production hosts keep the strict check.
      allowedOrigins: allowProxyHosts ? ["localhost:3000", ...codespaceHosts] : [],
    },
  },
};

export default nextConfig;
