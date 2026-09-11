// Place at: tests/components/CarQuoteForm.test.tsx
//
// Car equivalent of QuoteForm.test.tsx - same shape, car-native
// selectors/assertions throughout (a different brand default, a
// motorcycle rejection instead of a four-wheeled one, /api/cars/verdict
// instead of /api/verdict).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarQuoteForm } from "@/components/CarQuoteForm";

describe("CarQuoteForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all four steps with their default selections", () => {
    render(<CarQuoteForm signedIn={false} />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("abarth");
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
  });

  it("shows a sell description before any lookup, tailored to signed-in vs anonymous", () => {
    const { unmount } = render(<CarQuoteForm signedIn />);
    expect(screen.getByText(/we'll compare it against real regional pricing benchmarks/)).toBeInTheDocument();
    unmount();

    render(<CarQuoteForm signedIn={false} />);
    expect(screen.getByText(/Sign in to search by registration/)).toBeInTheDocument();
    expect(screen.getByText(/pricing benchmarks for this car's region, brand and job type/)).toBeInTheDocument();
  });

  it("submits the real form state to /api/cars/verdict and renders the returned verdict", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        verdict: "fair",
        range: { low: 200, high: 350 },
        brandTier: "mainstream",
        brandLabel: "Ford",
        regionLabel: "Rest of England & Wales",
        communityStats: null,
      }),
    });

    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={false} />);
    await user.selectOptions(screen.getByLabelText("Make"), "ford");
    await user.type(screen.getByLabelText("What you were quoted"), "260");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByText(/typical £200–£350/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/verdict",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          carClass: "medium",
          brand: "ford",
          region: "rest-england-wales",
          jobType: "full-service",
          quotedPrice: 260,
        }),
      })
    );
  });

  it("shows the server's own error message when the API responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Something specific went wrong server-side." }),
    });

    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("What you were quoted"), "260");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("What you were quoted"), "260");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });

  it("signed out: clicking plate lookup shows a sign-in prompt instead of calling fetch", async () => {
    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/sign in here/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("signed in: a found car plate updates the brand field (car size can't auto-fill from this lookup)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Ford",
        model: "Focus",
        fuelType: "Petrol",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: "2026-01-01",
        motTests: [],
      }),
    });

    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("ford"));
    // Left on its default - MotHistoryDetails has no EngineCapacityCc,
    // and CAR_MODELS deliberately carries no engine-size data either.
    expect(screen.getByLabelText("Car size")).toHaveValue("medium");
    expect(screen.getByText(/Found: Ford Focus/)).toBeInTheDocument();
  });

  // The explicit "that's a motorcycle, not a car" rejection no longer
  // exists - MotHistoryDetails has no body-type field to classify
  // vehicle kind from. A mismatched vehicle just resolves to "other"
  // brand rather than being rejected outright.
  it("signed in: a motorcycle's plate (no matching car brand) resolves to 'other' rather than being rejected", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE",
        make: "Yamaha",
        model: "MT-07",
        fuelType: "Petrol",
        colour: "Blue",
        plateInRetention: false,
        motDueDate: "2026-06-01",
        motTests: [],
      }),
    });

    const user = userEvent.setup();
    render(<CarQuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("other"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
