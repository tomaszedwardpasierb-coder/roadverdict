// Place at: tests/components/PrintButton.test.tsx
//
// Trivial by design (9 lines, one button, one call) - two tests is
// plenty. Only window.print is stubbed, since jsdom has no real print
// pipeline to invoke.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PrintButton } from "@/app/report/[token]/PrintButton";

describe("PrintButton", () => {
  beforeEach(() => {
    vi.stubGlobal("print", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders a button labelled to print the report", () => {
    render(<PrintButton />);
    expect(screen.getByRole("button", { name: "Print this report" })).toBeInTheDocument();
  });

  it("calls window.print when clicked", async () => {
    const user = userEvent.setup();
    render(<PrintButton />);
    await user.click(screen.getByRole("button", { name: "Print this report" }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
