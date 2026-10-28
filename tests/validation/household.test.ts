import { describe, expect, it } from "vitest";
import { inviteSchema } from "@/lib/validation/household";

describe("inviteSchema", () => {
  it("trims and lowercases the email", () => {
    expect(inviteSchema.parse({ email: "  Ada@Example.COM " })).toEqual({ email: "ada@example.com" });
  });

  it("rejects bad emails", () => {
    expect(inviteSchema.safeParse({ email: "" }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "nope" }).success).toBe(false);
    expect(inviteSchema.safeParse({}).success).toBe(false);
  });
});
