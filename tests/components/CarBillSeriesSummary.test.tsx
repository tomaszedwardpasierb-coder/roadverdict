// Place at: tests/components/CarBillSeriesSummary.test.tsx
// No test file previously existed for this component (same as its bike
// equivalent, BillSeriesSummary.tsx) - kept deliberately focused on the
// one real behaviour worth pinning down (End this plan's PATCH + the
// car spinner while it's in flight), not a full re-derivation of every
// schedule-math test already covered by billSeriesSchedule.ts's own tests.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarBillSeriesSummary } from "@/app/dashboard/CarBillSeriesSummary";
import type { CarBillSeriesDoc } from "@/lib/tracker/carBillSeries";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const activeSeries: CarBillSeriesDoc = {
  id: "car-1::carBillSeries::1",
  pk: "x",
  type: "carBillSeries",
  carId: "car-1",
  billType: "insurance",
  frequency: "monthly",
  startDate: "2025-01-01",
  collectionDay: 1,
  instalmentAmount: 50,
  instalmentCount: 12,
  lastMaterializedIndex: 2,
  status: "active",
  notes: "Renewed annually",
  date: "2025-01-01",
  createdAt: "2025-01-01T00:00:00.000Z",
} as any;

describe("CarBillSeriesSummary", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the real bill type, frequency, total cost, logged count and status", () => {
    render(<CarBillSeriesSummary series={[activeSeries]} currency="GBP" rates={null} />);
    expect(screen.getByText(/Insurance plan · Monthly/)).toBeInTheDocument();
    expect(screen.getByText("£600.00 total")).toBeInTheDocument();
    expect(screen.getByText(/3 of 12 payments logged so far/)).toBeInTheDocument();
    expect(screen.getByText("Renewed annually")).toBeInTheDocument();
  });

  it("hides the 'End this plan' button once a plan is no longer active", () => {
    render(<CarBillSeriesSummary series={[{ ...activeSeries, status: "completed" }]} currency="GBP" rates={null} />);
    expect(screen.queryByRole("button", { name: "End this plan" })).not.toBeInTheDocument();
    expect(screen.getByText(/plan completed/)).toBeInTheDocument();
  });

  it("End this plan PATCHes the real endpoint with action:end once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<CarBillSeriesSummary series={[activeSeries]} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "End this plan" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-bill-series/car-1%3A%3AcarBillSeries%3A%3A1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ action: "end" }) })
    );
  });

  it("does nothing if ending the plan is declined at the confirm prompt", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    render(<CarBillSeriesSummary series={[activeSeries]} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "End this plan" }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows the car spinner on 'End this plan' while the request is in flight", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<CarBillSeriesSummary series={[activeSeries]} currency="GBP" rates={null} />);
    await user.click(screen.getByRole("button", { name: "End this plan" }));

    const button = screen.getByRole("button", { name: "Ending…" });
    expect(button.querySelector("svg")).toBeInTheDocument();
    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByRole("button", { name: "End this plan" });
  });
});
