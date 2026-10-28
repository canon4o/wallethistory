import { afterAll, describe, expect, it, vi } from "vitest";
import { updateTheme } from "@/lib/actions/users";
import { THEME_COOKIE } from "@/lib/theme";
import { cookieJar } from "../helpers/cookie-jar";
import { signInAs, signOut } from "../helpers/auth";
import { TEST_DATABASE_URL } from "../helpers/test-db";
import { useTestUsers } from "../helpers/users";

vi.mock("@/lib/env", async () => {
  const { testEnv } = await import("../helpers/env");
  return { getEnv: () => testEnv };
});

describe.skipIf(!TEST_DATABASE_URL)("updateTheme", () => {
  const users = useTestUsers();
  afterAll(users.cleanup);

  it("works without a session, for the login pages", async () => {
    signOut();
    expect(await updateTheme({ theme: "light" })).toEqual({ ok: true });
    expect(cookieJar.get(THEME_COOKIE)?.value).toBe("light");
  });

  it("saves the theme in a cookie", async () => {
    const ada = await users.create();
    await signInAs(ada.id);
    expect(await updateTheme({ theme: "dark" })).toEqual({ ok: true });
    expect(cookieJar.get(THEME_COOKIE)?.value).toBe("dark");
    expect(cookieJar.lastSetOptions).toMatchObject({ path: "/", sameSite: "lax" });
  });

  it("rejects an unknown theme", async () => {
    const ada = await users.create();
    await signInAs(ada.id);
    const result = await updateTheme({ theme: "sepia" });
    expect(result.ok).toBe(false);
    expect(cookieJar.get(THEME_COOKIE)).toBeUndefined();
  });
});
