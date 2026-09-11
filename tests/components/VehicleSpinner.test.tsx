// Place at: tests/components/VehicleSpinner.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VehicleSpinner } from "@/components/VehicleSpinner";

describe("VehicleSpinner", () => {
  it("renders an svg by default (bike kind)", () => {
    const { container } = render(<VehicleSpinner />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("is decorative (aria-hidden, no status role) by default, since it's normally sat next to its own already-descriptive text", () => {
    const { container, queryByRole } = render(<VehicleSpinner />);
    expect(queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it("exposes a status role and accessible label for screen readers when decorative is explicitly turned off", () => {
    const { getByRole } = render(<VehicleSpinner label="Looking up…" decorative={false} />);
    expect(getByRole("status")).toHaveAttribute("aria-label", "Looking up…");
  });

  it("falls back to a generic label when none is given, but decorative is off", () => {
    const { getByRole } = render(<VehicleSpinner decorative={false} />);
    expect(getByRole("status")).toHaveAttribute("aria-label", "Loading");
  });

  it("applies the requested size to the svg", () => {
    const { container } = render(<VehicleSpinner size={32} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
  });

  it("defaults to size 18 when none is given", () => {
    const { container } = render(<VehicleSpinner />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "18");
  });

  it("renders 8 wire spokes for the bike wheel", () => {
    const { container } = render(<VehicleSpinner kind="bike" />);
    expect(container.querySelectorAll("line").length).toBe(8);
  });

  it("renders a 5-spoke alloy wedge pattern and grit particles for the car wheel", () => {
    const { container } = render(<VehicleSpinner kind="car" />);
    expect(container.querySelectorAll("path").length).toBe(5);
    // 3 grit particles, rendered as plain (non-wheel) circles alongside the wheel's own circles
    expect(container.querySelectorAll("circle").length).toBeGreaterThanOrEqual(3 + 4);
  });

  it("never renders both wheel variants at once", () => {
    const { container: bike } = render(<VehicleSpinner kind="bike" />);
    expect(bike.querySelectorAll("path").length).toBe(0);
    const { container: car } = render(<VehicleSpinner kind="car" />);
    expect(car.querySelectorAll("line").length).toBe(0);
  });
});
