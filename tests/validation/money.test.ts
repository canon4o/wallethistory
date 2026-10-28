import { describe, expect, it } from "vitest";
import { nonNegativeMoney, normalizeMoneyInput, positiveMoney } from "@/lib/validation/money";

describe("money parsing", () => {
  it("treats a comma like a dot", () => {
    expect(normalizeMoneyInput(" 7,5 ")).toBe("7.5");
    expect(positiveMoney.parse("7,5")).toBe("7.50");
    expect(positiveMoney.parse("7.5")).toBe("7.50");
    expect(positiveMoney.parse("100,25")).toBe("100.25");
    expect(nonNegativeMoney.parse("0,00")).toBe("0.00");
    expect(positiveMoney.parse("12")).toBe("12.00");
  });

  it("still rejects invalid amounts", () => {
    for (const bad of ["", "7,", ",5", "1,2,3", "1,234.50", "7,555", "1.2,3", "-5", "abc", "0,00"]) {
      expect(positiveMoney.safeParse(bad).success, bad).toBe(false);
    }
    expect(nonNegativeMoney.safeParse("1,234.50").success).toBe(false);
  });
});
