import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "@/lib/actions/users";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import { getLocale, getT } from "@/lib/i18n/server";
import { cookieJar } from "../helpers/cookie-jar";
import { requestHeaders } from "../helpers/request-headers";

beforeEach(() => {
  cookieJar.reset();
  requestHeaders.reset();
});

describe("getLocale", () => {
  it("prefers the cookie", async () => {
    cookieJar.set(LOCALE_COOKIE, "bg");
    expect(await getLocale()).toBe("bg");
    expect((await getT())("Save")).not.toBe("");
  });

  it("ignores an unknown cookie value and falls back to English", async () => {
    cookieJar.set(LOCALE_COOKIE, "xx");
    expect(await getLocale()).toBe("en");
  });
});

describe("getLocale without a cookie", () => {
  it("uses the browser's language", async () => {
    requestHeaders.set("accept-language", "bg-BG,bg;q=0.9");
    expect(await getLocale()).toBe("bg");
  });

  it("falls back to English outside a request", async () => {
    requestHeaders.unavailable = true;
    expect(await getLocale()).toBe("en");
  });
});

describe("setLocale", () => {
  it("works without a session and sets the cookie", async () => {
    expect(await setLocale({ locale: "es" })).toEqual({ ok: true });
    expect(cookieJar.get(LOCALE_COOKIE)?.value).toBe("es");
    expect(cookieJar.lastSetOptions).toMatchObject({ path: "/", sameSite: "lax" });
    expect(await getLocale()).toBe("es");
  });

  it("rejects an unknown language", async () => {
    const result = await setLocale({ locale: "fr" });
    expect(result.ok).toBe(false);
    expect(cookieJar.get(LOCALE_COOKIE)).toBeUndefined();
  });
});
