import { afterEach, describe, expect, it, vi } from "vitest";

const execute = vi.fn();
vi.mock("@/db", () => ({ getDb: () => ({ execute }) }));

import { isDatabaseHealthy } from "@/lib/data/health";

describe("isDatabaseHealthy", () => {
  afterEach(() => {
    execute.mockReset();
    vi.useRealTimers();
  });

  it("is true when the database answers", async () => {
    execute.mockResolvedValue([{ "?column?": 1 }]);
    await expect(isDatabaseHealthy()).resolves.toBe(true);
  });

  it("is false when the query fails", async () => {
    execute.mockRejectedValue(new Error("connection refused"));
    await expect(isDatabaseHealthy()).resolves.toBe(false);
  });

  it("is false when the database does not answer in time", async () => {
    vi.useFakeTimers();
    execute.mockReturnValue(new Promise(() => {}));
    const result = isDatabaseHealthy();
    await vi.advanceTimersByTimeAsync(3000);
    await expect(result).resolves.toBe(false);
  });
});
