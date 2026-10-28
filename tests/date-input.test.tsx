// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "@/components/ui/DateInput";

afterEach(cleanup);

describe("DateInput", () => {
  it("shows the value as YYYY-MM-DD and is read-only", () => {
    render(<DateInput id="d" label="Date" value="2026-03-04" onChange={vi.fn()} />);
    const input = screen.getByLabelText("Date");
    expect(input).toHaveValue("2026-03-04");
    expect(input).toHaveAttribute("readonly");
  });

  it("works uncontrolled and submits its name", () => {
    const { container } = render(
      <form>
        <DateInput id="d" name="from" label="From" defaultValue="2026-01-02" />
      </form>,
    );
    const form = container.querySelector("form") as HTMLFormElement;
    expect(new FormData(form).get("from")).toBe("2026-01-02");
    fireEvent.click(screen.getByLabelText("From"));
    fireEvent.click(screen.getByLabelText(/Choose Tuesday, January 6th, 2026/));
    expect(new FormData(form).get("from")).toBe("2026-01-06");
  });

  it("opens a calendar starting on Monday by default and picks a day", () => {
    const onChange = vi.fn();
    render(<DateInput id="d" label="Date" value="2026-03-04" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Date"));
    expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Mon");
    fireEvent.click(screen.getByLabelText(/Choose Tuesday, March 10th, 2026/));
    expect(onChange).toHaveBeenCalledWith("2026-03-10");
  });

  it("shows an error and describes the field with it", () => {
    render(<DateInput id="d" label="Date" error="Pick a date" />);
    expect(screen.getByLabelText("Date")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent("Pick a date");
  });
});
