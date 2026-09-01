// Place at: tests/components/ChartTypeToggle.test.tsx
//
// Chart-type (line/bar/pie) picker. Covers the real "hide entirely when
// there's only one option" guard, plus that the correct button reflects
// the active kind and calls back on change.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChartTypeToggle } from "@/app/dashboard/ChartTypeToggle";
import styles from "@/app/dashboard/dashboard.module.css";

describe("ChartTypeToggle", () => {
  it("renders nothing when there's only one available chart kind", () => {
    const { container } = render(<ChartTypeToggle value="line" onChange={vi.fn()} options={["line"]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("marks the current value's button active among the given options", () => {
    render(<ChartTypeToggle value="bar" onChange={vi.fn()} options={["line", "bar", "pie"]} />);
    expect(screen.getByRole("button", { name: "Bar" })).toHaveClass(styles.chartTypeToggleBtnActive);
    expect(screen.getByRole("button", { name: "Line" })).not.toHaveClass(styles.chartTypeToggleBtnActive);
    expect(screen.getByRole("button", { name: "Pie" })).not.toHaveClass(styles.chartTypeToggleBtnActive);
  });

  it("clicking a different option calls onChange with that kind", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ChartTypeToggle value="line" onChange={onChange} options={["line", "bar"]} />);

    await user.click(screen.getByRole("button", { name: "Bar" }));
    expect(onChange).toHaveBeenCalledWith("bar");
  });
});
