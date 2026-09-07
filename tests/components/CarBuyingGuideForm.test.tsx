// Place at: tests/components/CarBuyingGuideForm.test.tsx
//
// No plate lookup at all in this pass (see RoadVerdict_Car_Plan_v3.md's
// Phase 7 section) - brand/car-size/age-band selects only, so this
// component takes no `signedIn` prop, unlike its motorcycle counterpart.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarBuyingGuideForm } from "@/components/CarBuyingGuideForm";

describe("CarBuyingGuideForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all three steps with their default selections, including the electric car-size option", () => {
    render(<CarBuyingGuideForm />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("abarth");
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByLabelText("Roughly how old")).toHaveValue("used");
    expect(screen.getByLabelText("Car size")).toContainHTML("Electric");
  });

  it("submits the real form state to /api/cars/buying-guide and renders the returned checklist", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: {
          emphasis: "Check both the mechanicals and the price.",
          inspectionPoints: ["Timing belt history"],
          questionsForSeller: ["Any coolant top-ups?"],
        },
        addendum: "Check the running costs the seller mentions.",
        brandNotes: null,
        ageBandLabel: "Used (2000–2014)",
        carClassLabel: "Medium (1.3-2.0L)",
        brandLabel: "Ford",
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm />);
    await user.selectOptions(screen.getByLabelText("Make"), "ford");
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("Timing belt history")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/buying-guide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ carClass: "medium", brand: "ford", ageBand: "used" }),
      })
    );
  });

  it("shows the server's own error message when the API responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something specific went wrong server-side." }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<CarBuyingGuideForm />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });
});
