// @vitest-environment jsdom
import { cleanup, screen, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Sparkline } from "@/components/dashboard/Sparkline";

afterEach(cleanup);

describe("Sparkline", () => {
  it("scales the values to its own minimum and maximum", () => {
    render(<Sparkline values={[10, 20, 30]} label="Trend" className="text-primary" />);
    const line = screen.getByRole("img", { name: "Trend" }).querySelector("polyline")!;
    expect(line.getAttribute("points")).toBe("0.0,22.0 50.0,12.0 100.0,2.0");
  });

  it("draws flat data in the middle and nothing for fewer than two points", () => {
    const { container, rerender } = render(<Sparkline values={[5, 5, 5]} label="Flat" className="x" />);
    expect(container.querySelector("polyline")!.getAttribute("points")).toBe("0.0,12.0 50.0,12.0 100.0,12.0");
    rerender(<Sparkline values={[5]} label="One" className="x" />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
