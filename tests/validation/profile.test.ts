import { translate } from "@/lib/i18n/translate";
import { describe, expect, it } from "vitest";
import { accountSchema } from "@/lib/validation/accounts";
import { createCategorySchema, updateCategorySchema } from "@/lib/validation/categories";
import { idSchema } from "@/lib/validation/common";
import { tagSchema } from "@/lib/validation/tags";
import { changePasswordSchema, deleteAccountSchema, updateProfileSchema } from "@/lib/validation/users";

function errors(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((result.error?.issues ?? []).map((i) => [i.path.join("."), translate("en", i.message)]));
}

describe("idSchema", () => {
  it("accepts uuids only", () => {
    expect(idSchema.safeParse("6f1c2d6e-7b0a-4a52-9d6e-0f7a3c1b2d4e").success).toBe(true);
    expect(idSchema.safeParse("123").success).toBe(false);
    expect(idSchema.safeParse("' or 1=1 --").success).toBe(false);
    expect(idSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("accountSchema", () => {
  const valid = { name: " Savings ", type: "savings", color: "#1aaaba", icon: "piggy-bank", initialBalance: "100" };

  it("trims the name and normalizes the balance to two decimals", () => {
    expect(accountSchema.parse(valid)).toEqual({ name: "Savings", type: "savings", color: "#1aaaba", icon: "piggy-bank", initialBalance: "100.00", isDefault: false });
    expect(accountSchema.parse({ ...valid, initialBalance: " 12.5 " }).initialBalance).toBe("12.50");
    expect(accountSchema.parse({ ...valid, isDefault: true }).isDefault).toBe(true);
    expect(accountSchema.parse({ ...valid, initialBalance: "0" }).initialBalance).toBe("0.00");
    expect(accountSchema.parse({ ...valid, initialBalance: "999999999999.99" }).initialBalance).toBe("999999999999.99");
  });

  it("requires a name of at most 100 characters", () => {
    expect(errors(accountSchema.safeParse({ ...valid, name: " " })).name).toMatch(/required/i);
    expect(errors(accountSchema.safeParse({ ...valid, name: "x".repeat(101) })).name).toMatch(/at most 100/);
  });

  it("only allows the fixed account types", () => {
    for (const type of ["cash", "bank", "card", "savings", "other"]) {
      expect(accountSchema.safeParse({ ...valid, type }).success).toBe(true);
    }
    expect(errors(accountSchema.safeParse({ ...valid, type: "crypto" })).type).toBeTruthy();
  });

  it("only allows palette colors and account icons", () => {
    expect(errors(accountSchema.safeParse({ ...valid, color: "#123456" })).color).toBeTruthy();
    expect(errors(accountSchema.safeParse({ ...valid, icon: "rocket" })).icon).toBeTruthy();
    expect(accountSchema.safeParse({ ...valid, icon: undefined }).success).toBe(false);
  });

  it("rejects negative, malformed, or too precise balances", () => {
    for (const bad of ["-5", "abc", "", "1,000", "1.234", "1e5", "1000000000000", ".5"]) {
      expect(accountSchema.safeParse({ ...valid, initialBalance: bad }).success, bad).toBe(false);
    }
  });
});

describe("category schemas", () => {
  const valid = { type: "expense", name: " Coffee ", color: "#1aaaba", icon: "coffee" };

  it("accepts a valid category and trims the name", () => {
    expect(createCategorySchema.parse(valid)).toEqual({ ...valid, name: "Coffee" });
  });

  it("requires type, name (max 50), a palette color, and an icon from the fixed list", () => {
    expect(errors(createCategorySchema.safeParse({ ...valid, type: "transfer" })).type).toBeTruthy();
    expect(errors(createCategorySchema.safeParse({ ...valid, name: "" })).name).toMatch(/required/i);
    expect(errors(createCategorySchema.safeParse({ ...valid, name: "x".repeat(51) })).name).toMatch(/at most 50/);
    expect(errors(createCategorySchema.safeParse({ ...valid, color: "#123456" })).color).toBeTruthy();
    expect(errors(createCategorySchema.safeParse({ ...valid, color: "red" })).color).toBeTruthy();
    expect(errors(createCategorySchema.safeParse({ ...valid, icon: "rocket" })).icon).toBeTruthy();
    expect(createCategorySchema.safeParse({}).success).toBe(false);
  });

  it("the update schema has no type, so it cannot be changed", () => {
    const parsed = updateCategorySchema.parse({ ...valid, type: "income" });
    expect(parsed).not.toHaveProperty("type");
  });
});

describe("tagSchema", () => {
  it("trims, requires a name, and caps it at 50 characters", () => {
    expect(tagSchema.parse({ name: "  trip " })).toEqual({ name: "trip" });
    expect(tagSchema.safeParse({ name: "  " }).success).toBe(false);
    expect(tagSchema.safeParse({ name: "x".repeat(51) }).success).toBe(false);
    expect(tagSchema.safeParse({ name: "x".repeat(50) }).success).toBe(true);
  });
});

describe("user schemas", () => {
  it("updateProfileSchema validates the name", () => {
    expect(updateProfileSchema.parse({ name: " Ada " })).toEqual({ name: "Ada" });
    expect(updateProfileSchema.safeParse({ name: "" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ name: "x".repeat(101) }).success).toBe(false);
  });

  it("changePasswordSchema needs the current password and a matching, different new password", () => {
    const valid = { currentPassword: "old-password", newPassword: "new-password-1", confirmPassword: "new-password-1" };
    expect(changePasswordSchema.safeParse(valid).success).toBe(true);
    expect(errors(changePasswordSchema.safeParse({ ...valid, currentPassword: "" })).currentPassword).toBeTruthy();
    expect(errors(changePasswordSchema.safeParse({ ...valid, newPassword: "short", confirmPassword: "short" })).newPassword).toMatch(/at least 8/);
    expect(errors(changePasswordSchema.safeParse({ ...valid, confirmPassword: "different-1" })).confirmPassword).toBe(
      "Passwords do not match",
    );
    expect(
      errors(changePasswordSchema.safeParse({ currentPassword: "same-password", newPassword: "same-password", confirmPassword: "same-password" }))
        .newPassword,
    ).toMatch(/different/);
  });

  it("deleteAccountSchema needs a password", () => {
    expect(deleteAccountSchema.safeParse({ password: "x" }).success).toBe(true);
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
  });
});
