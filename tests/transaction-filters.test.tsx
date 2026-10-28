// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FiltersToggleProvider } from "@/components/ui/CollapsibleFilters";
import { TransactionFilters } from "@/components/transactions/TransactionFilters";
import { renderServer, rerenderServer } from "./helpers/server-render";

const base = { accounts: [], categories: [], tags: ["trip"] };

// The filter panel shares its open/closed state with the page header's button through this provider.
const filtersWith = (filters: Parameters<typeof TransactionFilters>[0]["filters"]) => (
  <FiltersToggleProvider>
    <TransactionFilters filters={filters} {...base} />
  </FiltersToggleProvider>
);

describe("TransactionFilters", () => {
  afterEach(cleanup);

  it("shows the active filters and a Clear filters link", async () => {
    await renderServer(filtersWith({ page: 1, q: "rent", from: "2026-01-01", tag: "trip" }));
    expect(screen.getByLabelText("Search notes")).toHaveValue("rent");
    expect(screen.getByLabelText("From")).toHaveValue("2026-01-01");
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute("href", "/transactions");
  });

  it("resets every field when the filters are cleared", async () => {
    const { rerender } = await renderServer(filtersWith({ page: 1, q: "rent", from: "2026-01-01", tag: "trip" }));
    await rerenderServer(rerender, filtersWith({ page: 1 }));
    expect(screen.getByLabelText("Search notes")).toHaveValue("");
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("Tag")).toHaveValue("");
    expect(screen.queryByRole("link", { name: "Clear filters" })).not.toBeInTheDocument();
  });

  it("keeps what the user typed when only the page changes", async () => {
    const { rerender } = await renderServer(filtersWith({ page: 1, q: "rent" }));
    await rerenderServer(rerender, filtersWith({ page: 2, q: "rent" }));
    expect(screen.getByLabelText("Search notes")).toHaveValue("rent");
  });
});
