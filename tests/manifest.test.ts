import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";

describe("web app manifest", () => {
  const m = manifest();

  it("is installable as a standalone app starting on the dashboard", () => {
    expect(m.name).toBe("WalletHistory");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/dashboard");
  });

  it("has 192 and 512 icons plus a maskable one, all present in public/", () => {
    const icons = m.icons ?? [];
    expect(icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) expect(existsSync(join(process.cwd(), "public", icon.src))).toBe(true);
  });
});
