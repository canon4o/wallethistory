// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { CategorySelect } from "@/components/categories/CategorySelect";

afterEach(cleanup);

describe("CategorySelect", () => {
  it("shows the remaining budget, or the overspend, next to budgeted categories", async () => {
    render(
      <CategorySelect
        id="cat"
        label="Category"
        categories={[
          { id: "a", name: "Groceries", icon: "cart", color: "#000000", budgetRemaining: "120.00" },
          { id: "b", name: "Fun", icon: "cart", color: "#000000", budgetRemaining: "-30.00" },
          { id: "c", name: "Rent", icon: "cart", color: "#000000" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /Groceries/ }).textContent).toContain("$120.00 left");
    expect(screen.getByRole("option", { name: /Fun/ }).textContent).toContain("over by $30.00");
    expect(screen.getByRole("option", { name: /Rent/ }).textContent).not.toContain("$");
  });
});
