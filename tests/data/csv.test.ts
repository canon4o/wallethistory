import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { csvField, toCsv, zipFiles } from "@/lib/data/csv";

describe("csvField", () => {
  it("leaves plain text alone and renders empty values as nothing", () => {
    expect(csvField("hello")).toBe("hello");
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
    expect(csvField(42)).toBe("42");
    expect(csvField(false)).toBe("false");
  });

  it("writes dates as ISO strings", () => {
    expect(csvField(new Date("2026-10-11T12:00:00Z"))).toBe("2026-10-11T12:00:00.000Z");
  });

  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises formula injection but keeps plain numbers", () => {
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField("+1+1")).toBe("'+1+1");
    expect(csvField("-cmd")).toBe("'-cmd");
    expect(csvField("@x")).toBe("'@x");
    expect(csvField("\tx")).toBe("'\tx");
    expect(csvField("=1,2")).toBe("\"'=1,2\"");
    expect(csvField("-50.00")).toBe("-50.00");
  });
});

describe("toCsv", () => {
  it("starts with a BOM, uses CRLF and ends with a line break", () => {
    expect(toCsv(["a", "b"], [[1, "x,y"]])).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});

describe("zipFiles", () => {
  it("makes an archive that unzip accepts, with intact UTF-8 content", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "zip-"));
    const file = path.join(dir, "out.zip");
    writeFileSync(file, zipFiles([{ name: "a.csv", content: "café,1\r\n" }, { name: "b.csv", content: "" }], new Date("2026-10-11T12:34:56Z")));
    expect(execFileSync("unzip", ["-tq", file]).toString()).toContain("No errors");
    expect(execFileSync("unzip", ["-p", file, "a.csv"]).toString("utf8")).toBe("café,1\r\n");
  });
});
