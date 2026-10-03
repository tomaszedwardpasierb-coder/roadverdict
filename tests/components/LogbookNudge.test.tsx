// The quiet "start a logbook" line under a free tool's result.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LogbookNudge } from "@/components/LogbookNudge";

describe("LogbookNudge", () => {
  it("invites a signed-out visitor to start a logbook, with the sign-up tagged as coming from a tool", () => {
    render(<LogbookNudge kind="bike" topic="quote" signedIn={false} />);
    expect(screen.getByText(/Paid for this job\?/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Start your logbook" });
    expect(link.getAttribute("href")).toBe("/login?redirect=%2Fdashboard%3FaddVehicle%3Dbike&src=tool");
  });

  it("words the running-cost version for the right vehicle", () => {
    render(<LogbookNudge kind="car" topic="cost" signedIn={false} />);
    expect(screen.getByText(/Track your car in a free logbook/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start tracking" }).getAttribute("href")).toContain("addVehicle%3Dcar");
  });

  it("shows nothing to someone already signed in", () => {
    const { container } = render(<LogbookNudge kind="bike" topic="quote" signedIn />);
    expect(container).toBeEmptyDOMElement();
  });
});
