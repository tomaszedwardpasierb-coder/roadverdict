// Place at: tests/components/CarBuyingGuideForm.test.tsx
// Mirrors BuyingGuideForm.test.tsx's own plate-lookup coverage, now that
// CarBuyingGuideForm.tsx has a full plate-search path too - no "Model"
// field to assert against here (the car form only has brand/size/age),
// so a matched lookup is checked against "Make" and "Car size" instead.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
    render(<CarBuyingGuideForm signedIn />);
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("abarth");
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByLabelText("Roughly how old")).toHaveValue("used");
    expect(screen.getByLabelText("Car size")).toContainHTML("Electric");
  });

  it("not signed in: attempting a lookup shows a sign-in prompt instead of calling the API", async () => {
    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn={false} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/sign in to search by the car's registration/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signed in: a matched plate renders MOT history, the AI briefing, and updates make/car size", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        year: 2021,
        fuelType: "Petrol",
        colour: "Blue",
        engineCapacityCc: 1000,
        plateInRetention: false,
        vehicleType: "four-wheeled",
        motDueDate: "2026-06-01",
        motTests: [
          { testDate: "2025-06-01", passed: true, mileage: 24200, mileageTrusted: true, notes: "" },
          { testDate: "2024-06-01", passed: false, mileage: 19100, mileageTrusted: false, notes: "Nearside front tyre worn" },
        ],
        briefing: {
          motFlags: ["Failed its 2024 MOT on tyre wear"],
          modelNotes: ["Known for a dual-mass flywheel weak point on this generation"],
          summary: "Overall a solid, common family hatch with one past MOT fail worth asking about.",
        },
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("ford"));
    expect(screen.getByLabelText("Car size")).toHaveValue("small");
    expect(screen.getByText(/MOT due/)).toBeInTheDocument();
    expect(screen.getByText("Nearside front tyre worn")).toBeInTheDocument();
    expect(screen.getByText("Failed its 2024 MOT on tyre wear")).toBeInTheDocument();
    expect(screen.getByText("Known for a dual-mass flywheel weak point on this generation")).toBeInTheDocument();
    expect(screen.getByText(/solid, common family hatch/)).toBeInTheDocument();
  });

  it("an electric fuel type resolves car size to 'electric' regardless of engine capacity", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Tesla",
        model: "Model 3",
        year: 2022,
        fuelType: "Electricity",
        colour: "White",
        engineCapacityCc: null,
        plateInRetention: false,
        vehicleType: "four-wheeled",
        motDueDate: null,
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Car size")).toHaveValue("electric"));
  });

  it("a lookup result with no MOT test history at all says so plainly, without a briefing section", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        year: 2025,
        fuelType: "Petrol",
        colour: "Blue",
        engineCapacityCc: 1000,
        plateInRetention: false,
        vehicleType: "four-wheeled",
        motDueDate: null,
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/no mot due date on record/i)).toBeInTheDocument();
    expect(screen.getByText(/no mot test history found/i)).toBeInTheDocument();
    expect(screen.queryByText(/AI-generated pre-purchase briefing/)).not.toBeInTheDocument();
  });

  it("a definite motorcycle is refused with the not-a-car message and never shows any MOT data", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Honda",
        model: "CB125R",
        year: 2020,
        fuelType: "Petrol",
        colour: "Black",
        engineCapacityCc: 125,
        plateInRetention: false,
        vehicleType: "motorcycle",
        motDueDate: "2026-01-01",
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/two wheels/i);
    expect(screen.queryByText(/MOT due/)).not.toBeInTheDocument();
  });

  it("an unknown vehicle type is refused with a distinct message, not treated as a car", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "",
        model: "",
        year: 0,
        fuelType: "",
        colour: "",
        engineCapacityCc: null,
        plateInRetention: false,
        vehicleType: "unknown",
        motDueDate: null,
        motTests: [],
        briefing: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't confirm what type of vehicle/i);
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
    render(<CarBuyingGuideForm signedIn />);
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
    render(<CarBuyingGuideForm signedIn />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<CarBuyingGuideForm signedIn />);
    await user.click(screen.getByRole("button", { name: "What should I check" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });
});
