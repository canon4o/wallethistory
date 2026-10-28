import { describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { GENERIC_ERROR, guarded, notFoundFailure, validationFailure } from "@/lib/actions/result";
import { z } from "zod";

describe("action result helpers", () => {
  it("guarded passes successful results through", async () => {
    expect(await guarded(async () => ({ ok: true as const }))).toEqual({ ok: true });
  });

  it("guarded hides unexpected errors behind a generic message and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await guarded(async () => {
      throw new Error('relation "secret_table" does not exist');
    });
    expect(result).toEqual({ ok: false, error: GENERIC_ERROR });
    expect(JSON.stringify(result)).not.toContain("secret_table");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("guarded lets Next.js redirects through", async () => {
    await expect(guarded(async () => redirect("/login"))).rejects.toMatchObject({
      digest: expect.stringContaining("NEXT_REDIRECT"),
    });
  });

  it("builds validation and not-found failures", async () => {
    const parsed = z.object({ name: z.string().min(1, "Required") }).safeParse({ name: "" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(await validationFailure(parsed.error)).toEqual({
      ok: false,
      error: "Please fix the highlighted fields.",
      fieldErrors: { name: ["Required"] },
    });
    expect(await notFoundFailure()).toEqual({ ok: false, error: "This item no longer exists." });
    expect(await notFoundFailure("Gone")).toEqual({ ok: false, error: "Gone" });
  });
});
