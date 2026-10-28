// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { AccountSelect } from "@/components/accounts/AccountSelect";

afterEach(cleanup);

describe("AccountSelect", () => {
  it("shows the balance next to the name when given", async () => {
    render(
      <AccountSelect
        id="acc"
        label="Account"
        accounts={[
          { id: "a", name: "Cash", icon: "wallet", color: "#000000", balance: "1234.50" },
          { id: "b", name: "Bank", icon: "wallet", color: "#000000" },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: /Cash/ }).textContent).toContain("$1,234.50");
    expect(screen.getByRole("option", { name: /Bank/ }).textContent).not.toContain("$");
  });

  it("keeps showing the balance on the closed select after choosing an account", async () => {
    render(
      <AccountSelect
        id="acc"
        label="Account"
        defaultValue="a"
        accounts={[{ id: "a", name: "Cash", icon: "wallet", color: "#000000", balance: "1234.50" }]}
      />,
    );
    expect(screen.getByRole("combobox").textContent).toContain("$1,234.50");
  });
});
