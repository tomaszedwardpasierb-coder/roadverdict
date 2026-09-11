// Place at: tests/components/VdiIcon.test.tsx
//
// VdiIcon is mostly a name-to-lucide-component lookup table with no
// branching worth exercising per-entry - one representative name is
// enough to prove the lookup works. What IS worth testing is the
// default size/strokeWidth this component applies on top of lucide's
// own defaults, that a caller can still override them, and the inline
// spacing style it always applies (since every call site relies on
// that for lining up with its adjacent text, rather than repeating it).
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { VdiIcon } from "@/components/VdiIcon";

describe("VdiIcon", () => {
  it("renders the svg for a known icon name", () => {
    const { container } = render(<VdiIcon name="stolen" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies this component's own default size and stroke-width, not lucide's raw defaults", () => {
    const { container } = render(<VdiIcon name="stolen" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "15");
    expect(svg).toHaveAttribute("height", "15");
    expect(svg).toHaveAttribute("stroke-width", "1.7");
  });

  it("lets a caller override the default size", () => {
    const { container } = render(<VdiIcon name="stolen" size={20} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "20");
    expect(svg).toHaveAttribute("height", "20");
  });

  it("applies the inline vertical-align/margin spacing every call site relies on", () => {
    const { container } = render(<VdiIcon name="stolen" />);
    const svg = container.querySelector("svg")!;
    expect(svg.style.verticalAlign).toBe("-2px");
    expect(svg.style.marginRight).toBe("0.15rem");
  });
});
