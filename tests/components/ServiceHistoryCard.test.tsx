// Place at: tests/components/ServiceHistoryCard.test.tsx
//
// ServiceHistoryCard is one service-record's card in the tracker: a view
// mode with a real benchmark-derived verdict tag, a scanner "needs review"
// state (with its own mileage-conflict Resolve flow), and an edit mode with
// real currency/distance-unit conversion and a real chronology check before
// it lets you save. Only fetch and next/navigation's useRouter are mocked
// (useTrackerFormSubmit calls useRouter) - everything else, including the
// real benchmark lookup and the real mileage-consistency check, runs for
// real. TabSwitchContext has a safe no-op fallback outside its Provider, so
// most cases render unwrapped; the one test that needs to observe an actual
// tab switch wraps in the real TabSwitchProvider instead of mocking the hook.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { getAdjustedBenchmark } from "@/lib/priceData";
import { formatCurrency } from "@/lib/tracker/currency";
import type { ServiceRecordDoc } from "@/lib/tracker/serviceRecord";
import type { HistoryPoint } from "@/lib/tracker/mileageCheck";

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

import { ServiceHistoryCard } from "@/app/dashboard/ServiceHistoryCard";
import { TabSwitchProvider } from "@/app/dashboard/TabSwitchContext";

function jsonOk(data: unknown) {
  return { ok: true, json: async () => data };
}
function jsonErr(data: unknown) {
  return { ok: false, json: async () => data };
}

const baseRecord: ServiceRecordDoc = {
  id: "rec-1",
  pk: "rider@example.com",
  type: "serviceRecord",
  date: "2025-06-01",
  createdAt: "2025-06-01T09:00:00.000Z",
  jobType: "full-service",
  cost: 120,
  mileage: 5000,
  notes: "Routine full service",
};

const defaultProps = {
  bikeClass: "medium" as const,
  brandValue: "honda",
  region: "rest-england-wales" as const,
  distanceUnit: "mi" as const,
  currency: "GBP" as const,
  rates: null,
  pendingReviewIds: { service: [], fuel: [], mods: [], bills: [] },
  mileageHistory: [] as HistoryPoint[],
  currentMileage: 8000,
};

describe("ServiceHistoryCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockRouter.push.mockClear();
    mockRouter.refresh.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the job label, cost, and a real benchmark-derived 'Fair' verdict tag for an in-range cost", () => {
    render(<ServiceHistoryCard {...defaultProps} record={baseRecord} />);
    expect(screen.getByText("Full service")).toBeInTheDocument();
    expect(screen.getByText("£120")).toBeInTheDocument();

    const bench = getAdjustedBenchmark("full-service", "medium", "honda", "rest-england-wales");
    expect(
      screen.getByText(`Fair (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
  });

  it("classifies an over-benchmark tyre cost as 'High' and shows the real affiliate tyre links", () => {
    const bench = getAdjustedBenchmark("tyres-pair", "medium", "honda", "rest-england-wales");
    const record = { ...baseRecord, jobType: "tyres-pair", cost: bench.high + 10 };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);

    expect(
      screen.getByText(`High (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "moto-tyres.co.uk" })).toHaveAttribute("href", "https://www.moto-tyres.co.uk");
    expect(screen.getByRole("link", { name: "mytyres.co.uk" })).toHaveAttribute("href", "https://www.mytyres.co.uk");
  });

  it("classifies a cost well past the high-multiple threshold as 'Second opinion'", () => {
    const bench = getAdjustedBenchmark("chain-and-sprockets", "medium", "honda", "rest-england-wales");
    const record = { ...baseRecord, jobType: "chain-and-sprockets", cost: Math.ceil(bench.high * 1.5) };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);

    expect(
      screen.getByText(`Second opinion (typical ${formatCurrency(bench.low, "GBP", null)}-${formatCurrency(bench.high, "GBP", null)})`)
    ).toBeInTheDocument();
  });

  it("shows no verdict tag at all for a job type that isn't benchmarked", () => {
    const record = { ...baseRecord, jobType: "oil-filter" };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    expect(screen.queryByText(/typical £/)).not.toBeInTheDocument();
  });

  it("shows the date/mileage line and an 'interpolated' mileage-confidence tag", () => {
    const record = { ...baseRecord, mileageConfidence: "interpolated" as const };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    // NB: "Â·" (not "·") is the component's own real rendered output - a
    // genuine mojibake bug already in ServiceHistoryCard.tsx's source (the
    // middle-dot separator appears to have been double-UTF-8-encoded), not
    // a typo introduced here. Asserting the actual behavior, per the house
    // rule of testing what's really reachable rather than what was intended.
    expect(screen.getByText("1 Jun 2025 Â· 5,000 miles")).toBeInTheDocument();
    // getByText's default normalizer trims leading/trailing whitespace, so
    // the leading space the component actually renders isn't part of the match.
    expect(screen.getByText("(mileage interpolated)")).toBeInTheDocument();
  });

  it("shows a distinct 'confirmed' mileage-confidence tag for a reviewed scanner record", () => {
    const record = { ...baseRecord, mileageConfidence: "confirmed" as const };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    expect(screen.getByText("(mileage confirmed - AI-assisted entry)")).toBeInTheDocument();
  });

  it("shows the original currency amount and rate date for a currency-converted record", () => {
    const record = {
      ...baseRecord,
      currencyConversion: { originalCurrency: "EUR", originalAmount: 138.5, rate: 1.15, ratedAt: "2025-06-01T00:00:00.000Z" },
    };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    expect(screen.getByText(/Originally 138.50 EUR/)).toBeInTheDocument();
  });

  it("shows the generic scanner-review note and any AI-written description on a scanner record with no specific conflict", () => {
    const record = { ...baseRecord, needsReview: true, aiDescription: "Receipt from a Halfords branch, full service." };
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    expect(screen.getByText(/Auto-created from a scanned receipt/)).toBeInTheDocument();
    expect(screen.getByText("Receipt from a Halfords branch, full service.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).not.toBeInTheDocument();
  });

  it("a chronology-flagged record shows its own warning, and Resolve fetches the conflicting entry and opens the resolution modal", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(jsonOk({ referenceId: "fuel-1", referenceCategory: "fuel" }))
      .mockResolvedValueOnce(
        jsonOk({ id: "fuel-1", category: "fuel", date: "2025-06-05", mileage: 4800, label: "Fuel", cost: 20, attachment: null, litres: 10, filledToFull: true })
      );
    const record = { ...baseRecord, needsReview: true, mileageConflictWarning: "Lower than a fuel log from 3 days later." };
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={record} />);
    expect(screen.getByText(/Lower than a fuel log from 3 days later\./)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/mileage-conflict-lookup?category=service&id=rec-1");
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
  });

  it("shows a specific error, not a modal, when the conflict-lookup fetch itself fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonErr({ error: "Could not determine which entry conflicts." }));
    const record = { ...baseRecord, needsReview: true, mileageConflictWarning: "Something's off." };
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={record} />);

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByText("Could not determine which entry conflicts.")).toBeInTheDocument();
    expect(screen.queryByText("Mileage conflict")).not.toBeInTheDocument();
  });

  it("opening Edit pre-fills cost and mileage converted to the rider's chosen currency and distance unit", async () => {
    const rates = { base: "GBP" as const, rates: { EUR: 1.15 }, fetchedAt: "2025-06-01T00:00:00.000Z" };
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={baseRecord} currency="EUR" rates={rates} distanceUnit="km" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Cost paid (€)")).toHaveValue(138);
    expect(screen.getByLabelText("Mileage (km)")).toHaveValue(8047);
  });

  it("saving edits sends a real PATCH converted back to GBP/miles, and returns to view mode", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(jsonOk({}));
    const rates = { base: "GBP" as const, rates: { EUR: 1.15 }, fetchedAt: "2025-06-01T00:00:00.000Z" };
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={baseRecord} currency="EUR" rates={rates} distanceUnit="km" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    // full-service defaults to a reminder being checked - switch it off so
    // the PATCH body under test doesn't also carry a `reminder` key.
    await user.click(screen.getByRole("checkbox", { name: /Remind me when this is due again/ }));
    const notesInput = screen.getByLabelText("Notes");
    await user.clear(notesInput);
    await user.type(notesInput, "Updated notes here");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        "/api/tracker/services/rec-1",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            jobType: "full-service",
            cost: 120,
            mileage: 5000,
            date: "2025-06-01",
            notes: "Updated notes here",
            attachments: [],
            mileageAcknowledged: false,
          }),
        })
      )
    );
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("blocks Save when the entered mileage genuinely conflicts with another record, until the warning is acknowledged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonOk({}));
    const mileageHistory: HistoryPoint[] = [{ id: "fuel-9", category: "fuel", date: "2025-07-01", mileage: 4000 }];
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={baseRecord} mileageHistory={mileageHistory} />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByText(/higher than a later entry on 1 Jul 2025/)).toBeInTheDocument();

    await user.click(screen.getByRole("checkbox", { name: "Yes, this mileage is correct" }));
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("Delete asks for confirmation first, and only calls the API if confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonOk({}));
    const user = userEvent.setup();
    render(<ServiceHistoryCard {...defaultProps} record={baseRecord} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith("/api/tracker/services/rec-1", expect.objectContaining({ method: "DELETE" }))
    );
  });

  it("after saving a record that needed review, with nothing left pending in its own tab, switches to the next tab that has one", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(jsonOk({}));
    const onSwitchTab = vi.fn();
    const record = { ...baseRecord, needsReview: true };
    const user = userEvent.setup();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <ServiceHistoryCard
          {...defaultProps}
          record={record}
          pendingReviewIds={{ service: ["rec-1"], fuel: ["fuel-1"], mods: [], bills: [] }}
        />
      </TabSwitchProvider>
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("checkbox", { name: /Remind me when this is due again/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSwitchTab).toHaveBeenCalledWith("fuel"));
  });
});
