import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Tests must never touch the dev database: point DATABASE_URL at the disposable test
// database, or remove it entirely so any accidental query fails loudly.
if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
} else {
  delete process.env.DATABASE_URL;
}
process.env.APP_URL ??= "http://localhost:3000";

// Next.js request-scoped APIs do not exist outside a request, so they are replaced globally.
vi.mock("next/headers", async () => {
  const { cookieJar } = await import("./helpers/cookie-jar");
  const { requestHeaders } = await import("./helpers/request-headers");
  return {
    cookies: async () => cookieJar,
    headers: async () => {
      requestHeaders.get("user-agent"); // throws when a test simulates "no request scope"
      return requestHeaders;
    },
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

// jsdom does not implement <dialog>.showModal()/close(); give it the minimum the Modal needs.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
