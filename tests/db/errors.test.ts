import { describe, expect, it } from "vitest";
import {
  isForeignKeyViolation,
  isUniqueViolation,
  postgresErrorCode,
} from "@/db/errors";

describe("postgres error helpers", () => {
  it("reads the SQLSTATE from the error or from its cause (Drizzle wraps driver errors)", () => {
    expect(postgresErrorCode({ code: "23505" })).toBe("23505");
    expect(postgresErrorCode({ message: "wrapped", cause: { code: "23503" } })).toBe("23503");
  });

  it("returns undefined for anything else", () => {
    expect(postgresErrorCode(undefined)).toBeUndefined();
    expect(postgresErrorCode(null)).toBeUndefined();
    expect(postgresErrorCode("23505")).toBeUndefined();
    expect(postgresErrorCode(new Error("boom"))).toBeUndefined();
    expect(postgresErrorCode({ code: 23505 })).toBeUndefined();
    expect(postgresErrorCode({ cause: "x" })).toBeUndefined();
  });

  it("recognizes unique and foreign key violations", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isForeignKeyViolation({ cause: { code: "23503" } })).toBe(true);
    expect(isForeignKeyViolation({ code: "23505" })).toBe(false);
  });
});
