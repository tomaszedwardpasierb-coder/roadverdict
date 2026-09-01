// Place at: tests/components/Icon.test.tsx
//
// Icon is mostly a name-to-lucide-component lookup table with no
// branching worth exercising per-entry - one representative name is
// enough to prove the lookup works. What IS worth testing is the
// default size/strokeWidth this component applies on top of lucide's
// own defaults, and that a caller can still override them.
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Icon } from "@/app/dashboard/Icon";

describe("Icon", () => {
  it("renders the svg for a known icon name", () => {
    const { container } = render(<Icon name="fuel" />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies this component's own default size and stroke-width, not lucide's raw defaults", () => {
    const { container } = render(<Icon name="fuel" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    expect(svg).toHaveAttribute("stroke-width", "1.7");
  });

  it("lets a caller override the default size", () => {
    const { container } = render(<Icon name="fuel" size={26} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "26");
    expect(svg).toHaveAttribute("height", "26");
  });
});
