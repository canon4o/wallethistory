import { describe, expect, it } from "vitest";
import translations from "@/lib/i18n/translations.json";
import { usedKeys } from "../helpers/translation-keys";

const entries = translations as Record<string, { bg: string; es: string }>;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)(?:,[^}]*)?\}/g)].map((m) => m[1]).sort();
const hashes = (text: string) => (text.match(/#/g) ?? []).length;

describe("translations.json", () => {
  const used = usedKeys();

  it("has bg and es text for every message used in the source", () => {
    const missing = [...used.keys()].filter((key) => !entries[key]?.bg?.trim() || !entries[key]?.es?.trim());
    expect(missing).toEqual([]);
  });

  it("has no entries the source no longer uses", () => {
    expect(Object.keys(entries).filter((key) => !used.has(key))).toEqual([]);
  });

  it("keeps placeholders and plural markers identical in every language", () => {
    const broken = Object.entries(entries).filter(([key, value]) => {
      const expected = placeholders(key).join();
      return (
        placeholders(value.bg).join() !== expected ||
        placeholders(value.es).join() !== expected ||
        hashes(value.bg) !== hashes(key) ||
        hashes(value.es) !== hashes(key)
      );
    });
    expect(broken.map(([key]) => key)).toEqual([]);
  });

  it("does not leave English text untranslated by accident", () => {
    const same = Object.entries(entries).filter(([key, value]) => key.length > 25 && (value.bg === key || value.es === key));
    expect(same.map(([key]) => key)).toEqual([]);
  });
});
