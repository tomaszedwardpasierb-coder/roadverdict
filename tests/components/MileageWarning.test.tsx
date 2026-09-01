// Place at: tests/components/MileageWarning.test.tsx
//
// Displays the real MileageCheckResult (src/lib/tracker/mileageCheck.ts)
// produced elsewhere - this file only covers the display/branching
// logic: no UI at all when ok, a plain message when blocked, and a
// message plus an acknowledge checkbox when it's just a warning.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MileageWarning } from "@/app/dashboard/MileageWarning";

describe("MileageWarning", () => {
  it("renders nothing when the check is ok", () => {
    const { container } = render(
      <MileageWarning result={{ status: "ok" }} distanceUnit="mi" acknowledged={false} onAcknowledgeChange={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("blocked (today-lower): shows the message with no acknowledge checkbox", () => {
    render(
      <MileageWarning
        result={{ status: "blocked", reason: "today-lower", referenceMileage: 5000 }}
        distanceUnit="mi"
        acknowledged={false}
        onAcknowledgeChange={vi.fn()}
      />
    );
    expect(screen.getByText(/can't be lower than your bike's current recorded miles \(5,000 miles\)/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("warning (below-earlier): shows the conflicting date/mileage and an acknowledge checkbox", async () => {
    const onAcknowledgeChange = vi.fn();
    const user = userEvent.setup();
    render(
      <MileageWarning
        result={{ status: "warning", reason: "below-earlier", referenceMileage: 8000, referenceDate: "2026-01-15" }}
        distanceUnit="mi"
        acknowledged={false}
        onAcknowledgeChange={onAcknowledgeChange}
      />
    );
    expect(screen.getByText(/lower than an earlier entry on 15 Jan 2026 \(8,000 miles\)/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(onAcknowledgeChange).toHaveBeenCalledWith(true);
  });

  it("warning (above-later): shows the specific higher-than-later-entry wording", () => {
    render(
      <MileageWarning
        result={{ status: "warning", reason: "above-later", referenceMileage: 3000, referenceDate: "2026-05-01" }}
        distanceUnit="mi"
        acknowledged={true}
        onAcknowledgeChange={vi.fn()}
      />
    );
    expect(screen.getByText(/higher than a later entry on 1 May 2026 \(3,000 miles\)/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
