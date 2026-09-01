// Place at: tests/components/BuyingGuideForm.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BuyingGuideForm } from "@/components/BuyingGuideForm";

describe("BuyingGuideForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signed in: a matched plate renders MOT history, the AI briefing, and updates the picked model", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        year: 2021,
        fuelType: "Petrol",
        colour: "Black",
        engineCapacityCc: 125,
        plateInRetention: false,
        vehicleType: "motorcycle",
        motDueDate: "2026-06-01",
        motTests: [
          { testDate: "2025-06-01", passed: true, mileage: 4200, mileageTrusted: true, notes: "" },
          { testDate: "2024-06-01", passed: false, mileage: 3100, mileageTrusted: false, notes: "Front tyre worn" },
        ],
        briefing: {
          motFlags: ["Failed its 2024 MOT on tyre wear"],
          modelNotes: ["Known for a recall on early chain guards"],
          summary: "Overall a solid, common commuter with one past MOT fail worth asking about.",
        },
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Model")).toHaveValue("CB125R"));
    expect(screen.getByText(/MOT due/)).toBeInTheDocument();
    expect(screen.getByText("Front tyre worn")).toBeInTheDocument();
    expect(screen.getByText("Failed its 2024 MOT on tyre wear")).toBeInTheDocument();
    expect(screen.getByText("Known for a recall on early chain guards")).toBeInTheDocument();
    expect(screen.getByText(/solid, common commuter/)).toBeInTheDocument();
  });

  it("a lookup result with no MOT test history at all says so plainly, without a briefing section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        year: 2025,
        fuelType: "Petrol",
        colour: "Black",
        engineCapacityCc: 125,
        plateInRetention: false,
        vehicleType: "motorcycle",
        motDueDate: null,
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/no mot due date on record/i)).toBeInTheDocument();
    expect(screen.getByText(/no mot test history found/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI-generated pre-purchase briefing/)).not.toBeInTheDocument();
  });

  it("a definite four-wheeled vehicle is refused with the not-a-bike message and never shows any MOT data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        year: 2020,
        fuelType: "Petrol",
        colour: "Blue",
        engineCapacityCc: null,
        plateInRetention: false,
        vehicleType: "four-wheeled",
        motDueDate: "2026-01-01",
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/four wheels/i);
    expect(screen.queryByText(/MOT due/)).not.toBeInTheDocument();
  });

  it("submits real form state to /api/buying-guide and renders the checklist, including brand-specific notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: {
          emphasis: "Check the chain and sprockets closely.",
          inspectionPoints: ["Chain wear", "Tyre tread"],
          questionsForSeller: ["Any recent services?"],
        },
        addendum: "Ask for a full service history if not already provided.",
        brandNotes: ["Early units had a known clutch rattle - listen for it on start-up."],
        ageBandLabel: "Used",
        bikeClassLabel: "Medium (401-750cc)",
        brandLabel: "Honda",
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("Check the chain and sprockets closely.")).toBeInTheDocument();
    expect(screen.getByText("Chain wear")).toBeInTheDocument();
    expect(screen.getByText(/Specific to Honda/)).toBeInTheDocument();
    expect(screen.getByText(/clutch rattle/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/buying-guide",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ bikeClass: "medium", brand: "honda", ageBand: "used" }),
      })
    );
  });

  it("omits the brand-specific section entirely when the API returns no brand notes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        checklist: { emphasis: "General checks apply.", inspectionPoints: ["Tyre tread"], questionsForSeller: [] },
        addendum: "Nothing brand-specific to flag here.",
        brandNotes: null,
        ageBandLabel: "Used",
        bikeClassLabel: "Medium (401-750cc)",
        brandLabel: "Other",
      }),
    });

    const user = userEvent.setup();
    render(<BuyingGuideForm signedIn={false} />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByText("General checks apply.")).toBeInTheDocument();
    expect(screen.queryByText(/Specific to/)).not.toBeInTheDocument();
  });
});
