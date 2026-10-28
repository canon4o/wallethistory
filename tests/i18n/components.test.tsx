// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LocaleSelect } from "@/components/layout/LocaleSelect";
import { I18nProvider, useLocale, useT } from "@/lib/i18n/client";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import { cookieJar } from "../helpers/cookie-jar";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  cookieJar.reset();
  refresh.mockClear();
});

function Probe() {
  const t = useT();
  return (
    <p>
      {useLocale()}:{t("Language")}
    </p>
  );
}

describe("I18nProvider", () => {
  it("defaults to English and translates for the given locale", () => {
    render(<Probe />);
    expect(screen.getByText("en:Language")).toBeInTheDocument();
    cleanup();
    render(
      <I18nProvider locale="es">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("es:Idioma")).toBeInTheDocument();
  });
});

describe("LocaleSelect", () => {
  it("shows the current language and lists all three with their names", async () => {
    render(<LocaleSelect locale="bg" compact />);
    const trigger = screen.getByRole("combobox", { name: "Language" });
    expect(trigger).toHaveTextContent("BG");
    await userEvent.setup().click(trigger);
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual(["English", "Български", "Español"]);
  });

  it("saves the choice and refreshes the page", async () => {
    render(<LocaleSelect locale="en" compact />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Language" }));
    await user.click(screen.getByRole("option", { name: "Български" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(cookieJar.get(LOCALE_COOKIE)?.value).toBe("bg");
  });

  it("is a regular labelled field outside the sign-in pages", () => {
    render(<LocaleSelect locale="es" />);
    expect(screen.getByText("Language")).not.toHaveClass("sr-only");
    expect(screen.getByRole("combobox", { name: "Language" })).toHaveTextContent("Español");
  });

  it("does nothing when the same language is chosen", async () => {
    render(<LocaleSelect locale="es" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getByRole("option", { name: "Español" }));
    expect(refresh).not.toHaveBeenCalled();
  });
});
