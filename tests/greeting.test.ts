import { describe, expect, it } from "vitest";
import { greeting } from "@/lib/greeting";
import { translator } from "@/lib/i18n/translate";

const en = translator("en");
const at = (iso: string) => new Date(iso);

describe("greeting", () => {
  it("changes with the hour in the user's timezone", () => {
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T05:00:00Z"))).toBe("Good morning, Ann");
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T11:59:00Z"))).toBe("Good morning, Ann");
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T12:00:00Z"))).toBe("Good afternoon, Ann");
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T18:00:00Z"))).toBe("Good evening, Ann");
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T00:30:00Z"))).toBe("Good evening, Ann");
    expect(greeting(en, "Ann", "UTC", at("2026-10-27T04:59:00Z"))).toBe("Good evening, Ann");
  });

  it("uses the timezone, not the server clock", () => {
    // 22:00 UTC is 07:00 the next day in Tokyo.
    expect(greeting(en, "Ann", "Asia/Tokyo", at("2026-10-27T22:00:00Z"))).toBe("Good morning, Ann");
  });

  it("uses the first name only and falls back without a name", () => {
    expect(greeting(en, "  Ann Lee ", "UTC", at("2026-10-27T09:00:00Z"))).toBe("Good morning, Ann");
    expect(greeting(en, "", "UTC", at("2026-10-27T09:00:00Z"))).toBe("Good morning");
  });

  it("translates", () => {
    expect(greeting(translator("bg"), "Ана", "UTC", at("2026-10-27T09:00:00Z"))).toBe("Добро утро, Ана");
  });
});
