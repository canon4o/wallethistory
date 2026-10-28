import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home Screen"). Deliberately no service worker: pages hold
// per-user financial data and writes are Server Actions, so nothing is cached for offline use.
// The manifest is static English: it is served without a session, so there is no user locale.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WalletHistory",
    short_name: "WalletHistory",
    description: "Track your accounts, transactions, and budgets.",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f5f8f9",
    theme_color: "#1aaaba",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
