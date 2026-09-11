// Place at: tests/components/QuoteForm.test.tsx
//
// The first component test in this repo - see vitest.components.config.ts
// for why this runs under its own jsdom-based command rather than the
// plain-Node unit/API suite. QuoteForm is the public quote-checker's
// entire client-side logic: a 4-step form, an optional plate lookup that
// behaves differently signed-in vs signed-out, and the result render.
// Only `fetch` is mocked - everything else (React state, the real
// VerdictResult child component, real label constants from priceData.ts)
// runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuoteForm } from "@/components/QuoteForm";

describe("QuoteForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders all four steps with their default selections", () => {
    render(<QuoteForm signedIn={false} />);
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Step 4 of 4")).toBeInTheDocument();
    expect(screen.getByLabelText("Make")).toHaveValue("honda");
    expect(screen.getByLabelText("Engine size")).toHaveValue("medium");
  });

  it("shows a sell description before any lookup, tailored to signed-in vs anonymous", () => {
    const { unmount } = render(<QuoteForm signedIn />);
    expect(screen.getByText(/we'll compare it against real regional pricing benchmarks/)).toBeInTheDocument();
    unmount();

    render(<QuoteForm signedIn={false} />);
    expect(screen.getByText(/Sign in to search by registration/)).toBeInTheDocument();
    expect(screen.getByText(/pricing benchmarks for this bike's region, brand and job type/)).toBeInTheDocument();
  });

  it("the price input's own min=1/required attributes block a browser submit before any price is entered", () => {
    // handleSubmit's own `price <= 0` / non-finite guard is defense in
    // depth - reachable only if a submit somehow occurs with an empty or
    // out-of-range value, which the input's real min="1" and required
    // attributes already prevent through ordinary interaction. Asserting
    // the constraints exist, rather than faking a submit past them.
    render(<QuoteForm signedIn={false} />);
    const input = screen.getByLabelText("What you were quoted");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toBeRequired();
  });

  it("submits the real form state to /api/verdict and renders the returned verdict", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        verdict: "fair",
        range: { low: 100, high: 200 },
        brandTier: "mainstream",
        brandLabel: "Honda",
        regionLabel: "Rest of England & Wales",
        communityStats: null,
        advice: null,
      }),
    });

    const user = userEvent.setup();
    render(<QuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("What you were quoted"), "180");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByText(/typical £100–£200/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/verdict",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          bikeClass: "medium",
          brand: "honda",
          region: "rest-england-wales",
          jobType: "full-service",
          quotedPrice: 180,
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
    render(<QuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("What you were quoted"), "180");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong server-side.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    render(<QuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("What you were quoted"), "180");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach roadverdict/i);
  });

  it("signed out: clicking plate lookup shows a sign-in prompt instead of calling fetch", async () => {
    const user = userEvent.setup();
    render(<QuoteForm signedIn={false} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    expect(await screen.findByText(/sign in here/i)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the bike spinner alongside the lookup button's own 'Looking up…' text while the request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const user = userEvent.setup();
    render(<QuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    const button = screen.getByRole("button", { name: "Looking up…" });
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch({
      ok: true,
      json: async () => ({
        vrm: "AB12CDE", make: "Yamaha", model: "MT-07", fuelType: "Petrol", colour: "Blue",
        plateInRetention: false, motDueDate: "2026-06-01", motTests: [],
      }),
    });
    await screen.findByRole("button", { name: "Look up" });
    expect(screen.getByRole("button", { name: "Look up" }).querySelector("svg")).not.toBeInTheDocument();
  });

  it("signed in: a found motorcycle plate updates the brand and, when the model matches the curated list, the engine-size field", async () => {
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
    render(<QuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("yamaha"));
    expect(screen.getByLabelText("Engine size")).toHaveValue("medium"); // MT-07 matches the curated list at 689cc -> medium
    expect(screen.getByText(/Found: Yamaha MT-07/)).toBeInTheDocument();
  });

  // The explicit "that's a car, not a bike" rejection no longer exists -
  // MotHistoryDetails (this lookup's only VDG call) has no body-type
  // field to classify vehicle kind from at all. A mismatched vehicle
  // just resolves to "other" brand, same as any make this tool doesn't
  // recognise, rather than being rejected outright.
  it("signed in: a car's plate (no matching bike brand) resolves to 'other' rather than being rejected", async () => {
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
    render(<QuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));

    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("other"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("silently includes the looked-up MOT tests in the /api/verdict submission, without rendering them", async () => {
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
        motTests: [{ testDate: "2025-06-01", passed: false, mileage: 4200, mileageTrusted: true, notes: "Rear brake pads worn" }],
      }),
    });

    const user = userEvent.setup();
    render(<QuoteForm signedIn={true} />);
    await user.type(screen.getByLabelText("Search by registration (optional)"), "AB12CDE");
    await user.click(screen.getByRole("button", { name: "Look up" }));
    await waitFor(() => expect(screen.getByLabelText("Make")).toHaveValue("yamaha"));

    // Never rendered directly - Quote Checker's UI is unchanged, the
    // lookup just enriches the AI advice silently.
    expect(screen.queryByText(/Rear brake pads worn/)).not.toBeInTheDocument();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ verdict: "fair", range: { low: 100, high: 200 }, brandTier: "mainstream", brandLabel: "Yamaha", regionLabel: "Rest of England & Wales", communityStats: null, advice: null }),
    });
    await user.type(screen.getByLabelText("What you were quoted"), "180");
    await user.click(screen.getByRole("button", { name: "Check my quote" }));

    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)![1].body);
    expect(body.motTests).toEqual([{ testDate: "2025-06-01", passed: false, notes: "Rear brake pads worn" }]);
  });
});
