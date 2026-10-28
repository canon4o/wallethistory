import { describe, expect, it } from "vitest";
import { matchAcceptLanguage, parseLocale } from "@/lib/i18n/locales";
import { msg, msgWith, translate, translator } from "@/lib/i18n/translate";
import translations from "@/lib/i18n/translations.json";

const entries = translations as Record<string, { bg: string; es: string }>;

describe("translate", () => {
  it("returns English text as is, filling placeholders", () => {
    expect(translate("en", "Save")).toBe("Save");
    expect(translate("en", "Hello {name}", { name: "Ada" })).toBe("Hello Ada");
    expect(translate("en", "Missing {x}")).toBe("Missing {x}");
  });

  it("translates known keys and falls back to English for unknown ones", () => {
    const key = Object.keys(entries)[0];
    expect(translate("bg", key)).toBe(entries[key].bg);
    expect(translate("es", key)).toBe(entries[key].es);
    expect(translate("bg", "Not a real key")).toBe("Not a real key");
  });

  it("fills placeholders after translating", () => {
    const key = Object.keys(entries).find((k) => k.includes("{name}") && !k.includes("plural"))!;
    expect(translate("es", key, { name: "Ana" })).toContain("Ana");
    expect(translate("es", key, { name: "Ana" })).not.toContain("{name}");
  });

  it("carries values with msgWith", () => {
    expect(translate("en", msgWith("At most {max} items", { max: 5 }))).toBe("At most 5 items");
    expect(translator("en")(msgWith("At most {max} items", { max: 5 }), { extra: 1 })).toBe("At most 5 items");
  });

  it("msg returns its input", () => {
    expect(msg("Label")).toBe("Label");
  });

  it("picks plural forms per language", () => {
    const source = "{count, plural, one {# day} other {# days}}";
    expect(translate("en", source, { count: 1 })).toBe("1 day");
    expect(translate("en", source, { count: 3 })).toBe("3 days");
    expect(translate("en", "{count, plural, =0 {none} other {#}}", { count: 0 })).toBe("none");
  });

  it("falls back to the other form, then to nothing", () => {
    expect(translate("en", "{n, plural, one {# a} other {# b}}", { n: 0 })).toBe("0 b");
    expect(translate("en", "{n, plural, one {x}}", { n: 5 })).toBe("");
  });

  it("uses the translated plural text", () => {
    const key = Object.keys(entries).find((k) => k.includes(", plural,"))!;
    expect(translate("bg", key, { count: 2, interval: 2, n: 2 })).not.toContain("plural");
  });
});

describe("locale helpers", () => {
  it("parses only known locales", () => {
    expect(parseLocale("bg")).toBe("bg");
    expect(parseLocale("fr")).toBeUndefined();
    expect(parseLocale(undefined)).toBeUndefined();
  });

  it("matches Accept-Language by quality and order", () => {
    expect(matchAcceptLanguage(null)).toBe("en");
    expect(matchAcceptLanguage("")).toBe("en");
    expect(matchAcceptLanguage("bg-BG,bg;q=0.9,en;q=0.5")).toBe("bg");
    expect(matchAcceptLanguage("fr-FR,es;q=0.8,en;q=0.5")).toBe("es");
    expect(matchAcceptLanguage("en;q=0.2,es;q=0.9")).toBe("es");
    expect(matchAcceptLanguage("de,fr")).toBe("en");
    expect(matchAcceptLanguage("es;q=0,bg;q=abc")).toBe("en");
  });
});
