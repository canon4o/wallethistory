// @vitest-environment jsdom
import { cleanup, screen, within, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchableSelect } from "@/components/ui/SearchableSelect";

const options = ["UTC", "Europe/Sofia", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Tokyo"].map(
  (name) => ({ value: name, label: name }),
);

afterEach(cleanup);

function Harness({ onChange = () => {}, disabled = false }: { onChange?: (value: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState("UTC");
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <SearchableSelect
        id="tz"
        label="Timezone"
        options={options}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        disabled={disabled}
        hint="Type to search"
        error={undefined}
      />
    </form>
  );
}

const input = () => screen.getByRole("combobox", { name: "Timezone" });
const names = () => within(screen.getByRole("listbox", { name: "Timezone" })).getAllByRole("option").map((o) => o.textContent);

describe("SearchableSelect", () => {
  it("shows the selected value and opens the full list on click", async () => {
    render(<Harness />);
    expect(input()).toHaveValue("UTC");
    expect(screen.queryByRole("listbox")).toBeNull();
    await userEvent.click(input());
    expect(names()).toEqual(options.map((o) => o.label));
    expect(input()).toHaveAttribute("aria-expanded", "true");
  });

  it("filters while typing, ignoring case and separators", async () => {
    render(<Harness />);
    await userEvent.click(input());
    await userEvent.type(input(), "europe");
    expect(names()).toEqual(["Europe/Sofia", "Europe/Berlin"]);
    await userEvent.clear(input());
    await userEvent.type(input(), "new york");
    expect(names()).toEqual(["America/New_York"]);
    await userEvent.clear(input());
    await userEvent.type(input(), "angeles america");
    expect(names()).toEqual(["America/Los_Angeles"]);
  });

  it("says when nothing matches and picks nothing on Enter", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "atlantis{Enter}");
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("picks with the mouse and closes", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "tok");
    await userEvent.click(screen.getByRole("option", { name: "Asia/Tokyo" }));
    expect(onChange).toHaveBeenCalledWith("Asia/Tokyo");
    expect(input()).toHaveValue("Asia/Tokyo");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("works from the keyboard without submitting the form", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    input().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await userEvent.type(input(), "europe");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(input()).toHaveAttribute("aria-activedescendant", "tz-option-1");
    await userEvent.keyboard("{ArrowUp}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("Europe/Berlin");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("opens with the arrow keys when closed", async () => {
    render(<Harness />);
    input().focus();
    await userEvent.keyboard("{Escape}");
    await userEvent.keyboard("{ArrowUp}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("Escape and Tab close without changing the value", async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.click(input());
    await userEvent.type(input(), "tok");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input()).toHaveValue("UTC");
    await userEvent.click(input());
    await userEvent.keyboard("{Tab}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes when focus leaves", async () => {
    render(
      <>
        <Harness />
        <button>Other</button>
      </>,
    );
    await userEvent.click(input());
    await userEvent.click(screen.getByRole("button", { name: "Other" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("does not open when disabled", async () => {
    render(<Harness disabled />);
    await userEvent.click(input());
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("shows the raw value when it is not among the options", () => {
    render(<SearchableSelect id="x" label="Zone" options={options} value="Mars/Olympus" onChange={() => {}} />);
    expect(screen.getByRole("combobox", { name: "Zone" })).toHaveValue("Mars/Olympus");
  });
});
