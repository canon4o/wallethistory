// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComparisonPeriodFields } from "@/components/reports/ComparisonPeriodFields";

const defaults = { month: { a: "2026-10", b: "2026-09" }, year: { a: "2026", b: "2025" } };

describe("ComparisonPeriodFields", () => {
  it("resets both periods to the new mode's defaults when Compare changes", () => {
    render(<ComparisonPeriodFields mode="month" a="2026-03" b="2026-01" years={["2026", "2025"]} defaults={defaults} />);
    expect((screen.getByLabelText("Period") as HTMLInputElement).value).toBe("2026-03");
    fireEvent.change(screen.getByLabelText("Compare"), { target: { value: "year" } });
    expect((screen.getByLabelText("Period") as HTMLSelectElement).value).toBe("2026");
    expect((screen.getByLabelText("Compared with") as HTMLSelectElement).value).toBe("2025");
    fireEvent.change(screen.getByLabelText("Compare"), { target: { value: "month" } });
    expect((screen.getByLabelText("Period") as HTMLInputElement).value).toBe("2026-10");
    expect((screen.getByLabelText("Compared with") as HTMLInputElement).value).toBe("2026-09");
  });
});

describe("ComparisonPeriodFields month calendar", () => {
  it("opens a month calendar and picks a month", () => {
    render(<ComparisonPeriodFields mode="month" a="2026-03" b="2026-01" years={["2026"]} defaults={defaults} />);
    fireEvent.click(screen.getByLabelText("Period"));
    fireEvent.click(screen.getByText("Jun"));
    expect((screen.getByLabelText("Period") as HTMLInputElement).value).toBe("2026-06");
  });
});
