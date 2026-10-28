import { describe, expect, it } from "vitest";
import { CURRENCIES, CURRENCY_CODES, DEFAULT_CURRENCY, currencyLabel, toCurrencyCode } from "@/lib/currencies";
import {
  DEFAULT_TIMEZONE,
  listTimezones,
  normalizeTimezone,
  timezoneOffsetLabel,
  toTimezone,
} from "@/lib/timezones";
import { registerSchema } from "@/lib/validation/auth";
import { adminRegionalSettingsSchema, regionalSettingsSchema } from "@/lib/validation/regional";

describe("currencies", () => {
  it("offers exactly USD, EUR and GBP with their symbols", () => {
    expect(CURRENCIES.map((c) => [c.code, c.symbol])).toEqual([
      ["USD", "$"],
      ["EUR", "€"],
      ["GBP", "£"],
    ]);
    expect(CURRENCY_CODES).toEqual(["USD", "EUR", "GBP"]);
    expect(DEFAULT_CURRENCY).toBe("USD");
  });

  it("labels a currency with its code and symbol", () => {
    expect(currencyLabel("USD")).toBe("USD ($)");
    expect(currencyLabel("EUR")).toBe("EUR (€)");
    expect(currencyLabel("GBP")).toBe("GBP (£)");
  });

  it("falls back to the default for unknown stored values", () => {
    expect(toCurrencyCode("EUR")).toBe("EUR");
    expect(toCurrencyCode("GBP")).toBe("GBP");
    expect(toCurrencyCode("CHF")).toBe("USD");
    expect(toCurrencyCode(null)).toBe("USD");
    expect(toCurrencyCode(undefined)).toBe("USD");
  });
});

describe("timezones", () => {
  it("normalizes valid names to their canonical spelling", () => {
    expect(normalizeTimezone("europe/sofia")).toBe("Europe/Sofia");
    expect(normalizeTimezone("UTC")).toBe("UTC");
    expect(normalizeTimezone("America/New_York")).toBe("America/New_York");
  });

  it("rejects unknown, empty and overlong names", () => {
    expect(normalizeTimezone("Mars/Olympus")).toBeNull();
    expect(normalizeTimezone("")).toBeNull();
    expect(normalizeTimezone("x".repeat(65))).toBeNull();
  });

  it("falls back to UTC for anything invalid", () => {
    expect(toTimezone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(toTimezone("nope")).toBe(DEFAULT_TIMEZONE);
    expect(toTimezone("")).toBe(DEFAULT_TIMEZONE);
    expect(toTimezone(null)).toBe(DEFAULT_TIMEZONE);
  });

  it("lists UTC first and every name once", () => {
    const names = listTimezones();
    expect(names[0]).toBe("UTC");
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("Europe/Sofia");
  });

  it("shows the offset right now", () => {
    const winter = new Date("2026-01-15T12:00:00Z");
    const summer = new Date("2026-07-15T12:00:00Z");
    expect(timezoneOffsetLabel("UTC", winter)).toBe("UTC+00:00");
    expect(timezoneOffsetLabel("Europe/Sofia", winter)).toBe("UTC+02:00");
    expect(timezoneOffsetLabel("Europe/Sofia", summer)).toBe("UTC+03:00");
    expect(timezoneOffsetLabel("America/New_York", winter)).toBe("UTC-05:00");
  });
});

describe("regional validation", () => {
  it("accepts GBP", () => {
    expect(regionalSettingsSchema.parse({ currency: "GBP", timezone: "UTC" }).currency).toBe("GBP");
  });

  it("accepts a known currency and a valid timezone", () => {
    expect(regionalSettingsSchema.parse({ currency: "EUR", timezone: "europe/sofia" })).toEqual({
      currency: "EUR",
      timezone: "Europe/Sofia",
    });
  });

  it("rejects unknown values with field errors", () => {
    const result = regionalSettingsSchema.safeParse({ currency: "CHF", timezone: "Mars/Olympus" });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["currency", "timezone"]);
    expect(regionalSettingsSchema.safeParse({}).success).toBe(false);
    expect(regionalSettingsSchema.safeParse({ currency: "usd", timezone: "UTC" }).success).toBe(false);
  });

  it("needs a user id for the admin version", () => {
    const base = { currency: "USD", timezone: "UTC" };
    expect(adminRegionalSettingsSchema.safeParse(base).success).toBe(false);
    expect(adminRegionalSettingsSchema.safeParse({ ...base, userId: "not-an-id" }).success).toBe(false);
    expect(
      adminRegionalSettingsSchema.safeParse({ ...base, userId: "6f4b0b5e-5e2a-4d3c-9c1e-0a1b2c3d4e5f" }).success,
    ).toBe(true);
  });

  const account = { name: "Ada", email: "ada@example.com", password: "password123", confirmPassword: "password123" };

  it("registration keeps a valid choice", () => {
    expect(registerSchema.parse({ ...account, currency: "EUR", timezone: "Asia/Tokyo" })).toMatchObject({
      currency: "EUR",
      timezone: "Asia/Tokyo",
    });
  });

  it("registration falls back to the defaults for a missing or invalid choice", () => {
    expect(registerSchema.parse(account)).toMatchObject({ currency: "USD", timezone: "UTC" });
    expect(registerSchema.parse({ ...account, currency: "CHF", timezone: "Mars/Olympus" })).toMatchObject({
      currency: "USD",
      timezone: "UTC",
    });
  });
});
