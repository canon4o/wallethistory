import { describe, expect, it } from "vitest";
import { alertLevel, usedPercent } from "@/lib/budget-alerts";

describe("alertLevel", () => {
  // A limit of 100.00 (10000 cents), threshold 80%.
  it("is null below the threshold, even by one cent", () => {
    expect(alertLevel(0, 10000, 80)).toBeNull();
    expect(alertLevel(7999, 10000, 80)).toBeNull();
  });

  it("warns at exactly the threshold and up to exactly the limit", () => {
    expect(alertLevel(8000, 10000, 80)).toBe("warning");
    expect(alertLevel(9999, 10000, 80)).toBe("warning");
    expect(alertLevel(10000, 10000, 80)).toBe("warning");
  });

  it("is exceeded one cent above the limit", () => {
    expect(alertLevel(10001, 10000, 80)).toBe("exceeded");
    expect(alertLevel(500000, 10000, 80)).toBe("exceeded");
  });

  it("compares in cents without float drift", () => {
    // 79.99 of 99.99 is 79.998...%, below 80%; 80.00 of 99.99 is just above it.
    expect(alertLevel(7999, 9999, 80)).toBeNull();
    expect(alertLevel(8000, 9999, 80)).toBe("warning");
  });

  it("handles the lowest and highest thresholds", () => {
    expect(alertLevel(4999, 10000, 50)).toBeNull();
    expect(alertLevel(5000, 10000, 50)).toBe("warning");
    expect(alertLevel(9899, 10000, 99)).toBeNull();
    expect(alertLevel(9900, 10000, 99)).toBe("warning");
    expect(alertLevel(10000, 10000, 99)).toBe("warning");
  });

  it("stays exact for the largest amounts the database allows", () => {
    const max = 99_999_999_999_999; // 999,999,999,999.99 in cents
    expect(alertLevel(max, max, 99)).toBe("warning");
    expect(alertLevel(max + 1, max, 99)).toBe("exceeded");
    expect(alertLevel(Math.floor(max * 0.98), max, 99)).toBeNull();
  });
});

describe("usedPercent", () => {
  it("rounds down to a whole percent", () => {
    expect(usedPercent(7999, 10000)).toBe(79);
    expect(usedPercent(8000, 10000)).toBe(80);
    expect(usedPercent(8599, 10000)).toBe(85);
    expect(usedPercent(15000, 10000)).toBe(150);
    expect(usedPercent(0, 10000)).toBe(0);
  });

  it("is 0 for a limit that is not positive", () => {
    expect(usedPercent(500, 0)).toBe(0);
  });
});
