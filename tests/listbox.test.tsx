// @vitest-environment jsdom
import { cleanup, screen, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Listbox, type ListboxOption } from "@/components/ui/Listbox";
import { AccountSelect } from "@/components/accounts/AccountSelect";
import { CategorySelect } from "@/components/categories/CategorySelect";

const options: ListboxOption[] = [
  { value: "", label: "All" },
  { value: "a", label: "Apple", detail: "$1.00" },
  { value: "b", label: "Banana" },
  { value: "c", label: "Cherry" },
];

function setup(props: Partial<React.ComponentProps<typeof Listbox>> = {}) {
  const onChange = vi.fn();
  const user = userEvent.setup();
  const view = render(<Listbox id="fruit" label="Fruit" options={options} onChange={onChange} {...props} />);
  return { onChange, user, ...view };
}
const trigger = () => screen.getByRole("combobox", { name: "Fruit" });

describe("Listbox", () => {
  afterEach(cleanup);

  it("shows the selected label and a closed list", () => {
    setup({ defaultValue: "b" });
    expect(trigger()).toHaveTextContent("Banana");
    expect(trigger()).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("falls back to the placeholder", () => {
    setup({ defaultValue: "zzz", placeholder: "Pick one" });
    expect(trigger()).toHaveTextContent("Pick one");
  });

  it("opens on click, selects with the pointer and closes", async () => {
    const { user, onChange } = setup();
    await user.click(trigger());
    expect(screen.getAllByRole("option")).toHaveLength(4);
    expect(screen.getByRole("option", { name: /Apple/ })).toHaveTextContent("$1.00");
    await user.click(screen.getByRole("option", { name: /Cherry/ }));
    expect(onChange).toHaveBeenCalledWith("c");
    expect(trigger()).toHaveTextContent("Cherry");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("is controlled when value is given", async () => {
    const { user, onChange } = setup({ value: "a" });
    await user.click(trigger());
    await user.click(screen.getByRole("option", { name: "Banana" }));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(trigger()).toHaveTextContent("Apple");
  });

  it("supports keyboard navigation, Home/End, Enter and Space", async () => {
    const { user, onChange } = setup({ defaultValue: "a" });
    trigger().focus();
    await user.keyboard("{ArrowDown}");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    const active = () => document.getElementById(trigger().getAttribute("aria-activedescendant") ?? "");
    expect(active()).toHaveTextContent("Apple");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(active()).toHaveTextContent("Cherry");
    await user.keyboard("{Home}");
    expect(active()).toHaveTextContent("All");
    await user.keyboard("{ArrowUp}");
    expect(active()).toHaveTextContent("All");
    await user.keyboard("{End}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("c");
    await user.keyboard("{ArrowUp}{ArrowUp}{ }");
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("jumps with typeahead, also while closed", async () => {
    const { user, onChange } = setup();
    trigger().focus();
    await user.keyboard("b");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("b");
    await user.keyboard("{ArrowDown}c{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("c");
  });

  it("closes on Escape without selecting, on Tab, and on an outside click", async () => {
    const { user, onChange } = setup();
    await user.click(trigger());
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(trigger());
    await user.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.click(trigger());
    await user.click(document.body);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("opens from the label and carries the value in a hidden input", async () => {
    const { user, container } = setup({ name: "fruit", defaultValue: "a" });
    expect(container.querySelector<HTMLInputElement>("input[name=fruit]")).toHaveValue("a");
    await user.click(screen.getByText("Fruit"));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Banana" }));
    expect(container.querySelector<HTMLInputElement>("input[name=fruit]")).toHaveValue("b");
  });

  it("shows hint and error text and can be disabled", async () => {
    const { user, rerender, onChange } = setup({ error: "Pick a fruit" });
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a fruit");
    expect(trigger()).toHaveAttribute("aria-invalid", "true");
    rerender(<Listbox id="fruit" label="Fruit" options={options} onChange={onChange} disabled />);
    await user.click(trigger());
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("groups options under headings", async () => {
    const { user } = setup({
      options: [
        { value: "a", label: "Apple", group: "Sweet" },
        { value: "b", label: "Lemon", group: "Sour" },
      ],
    });
    await user.click(trigger());
    expect(screen.getByRole("group", { name: "Sweet" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Sour" })).toBeInTheDocument();
  });
});

describe("CategorySelect and AccountSelect", () => {
  afterEach(cleanup);

  it("lists categories by type with an empty option", async () => {
    const user = userEvent.setup();
    render(
      <CategorySelect
        id="c"
        label="Category"
        emptyLabel="All categories"
        groupByType
        categories={[
          { id: "1", name: "Salary", icon: "banknote", color: "#9cca56", type: "income" },
          { id: "2", name: "Rent", icon: "home", color: "#337ab7", type: "expense" },
        ]}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Category" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["All categories", "Rent", "Salary"]);
    expect(screen.getByRole("group", { name: "Expense" })).toBeInTheDocument();
  });

  it("hides the excluded account", async () => {
    const user = userEvent.setup();
    render(
      <AccountSelect
        id="a"
        label="To"
        excludeId="1"
        accounts={[
          { id: "1", name: "Cash", icon: "banknote", color: "#9cca56" },
          { id: "2", name: "Bank", icon: "landmark", color: "#337ab7" },
        ]}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "To" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Bank"]);
  });
});
