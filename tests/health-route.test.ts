import { describe, expect, it, vi } from "vitest";

const isDatabaseHealthy = vi.fn();
vi.mock("@/lib/data/health", () => ({ isDatabaseHealthy: () => isDatabaseHealthy() }));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 ok when the database is reachable", async () => {
    isDatabaseHealthy.mockResolvedValue(true);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("returns 503 without details when it is not", async () => {
    isDatabaseHealthy.mockResolvedValue(false);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "error" });
  });
});
