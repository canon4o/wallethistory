// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "@/app/(app)/error";
import AppLoading from "@/app/(app)/loading";
import GlobalError from "@/app/global-error";
import NotFound from "@/app/not-found";
import RootError from "@/app/error";
import { renderServer, resolveServer } from "./helpers/server-render";

afterEach(cleanup);

describe.each([
  ["app section", AppError],
  ["root", RootError],
])("%s error page", (_name, ErrorPage) => {
  it("says something went wrong without exposing the error, and offers a retry", async () => {
    const reset = vi.fn();
    const error = new Error('relation "secret_table" does not exist');
    await renderServer(<ErrorPage error={error} reset={reset} />);
    expect(screen.getByRole("heading", { level: 1, name: "Something went wrong" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("We could not load this page. Please try again.");
    expect(document.body).not.toHaveTextContent("secret_table");
    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe("loading page", () => {
  it("announces that the page is loading", async () => {
    await renderServer(<AppLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");
  });
});

describe("not found page", () => {
  it("explains the problem and links back", async () => {
    const html = renderToStaticMarkup(<>{await resolveServer(<NotFound />)}</>);
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).toContain("<main");
  });
});

describe("global error page", () => {
  it("renders a complete document with a retry button", async () => {
    const html = renderToStaticMarkup(<GlobalError error={new Error("x")} reset={() => {}} />);
    expect(html).toContain("<html");
    expect(html).toContain("Something went wrong");
    expect(html).toContain("Try again");
    expect(html).not.toContain("secret");
  });
});
