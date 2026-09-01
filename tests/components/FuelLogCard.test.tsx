// Place at: tests/components/FuelLogCard.test.tsx
//
// FuelLogCard is one fuel-log record's card: a read view with real unit
// conversion (distance/currency) and mileage-confidence labelling, and an
// edit form with real mileage-consistency checking (checkMileageConsistency
// from mileageCheck.ts) that can outright block a save, not just warn.
// Only `fetch`, `window.confirm` and (where noted) Element.scrollIntoView
// are stubbed - TabSwitchContext is the real provider so the cross-card
// "go to next thing needing review" hand-off can be exercised for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FuelLogCard } from "@/app/dashboard/FuelLogCard";
import { TabSwitchProvider, useTabSwitch, type ReviewCategory } from "@/app/dashboard/TabSwitchContext";
import type { FuelLogDoc } from "@/lib/tracker/fuelLog";
import type { HistoryPoint } from "@/lib/tracker/mileageCheck";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function makeLog(overrides: Partial<FuelLogDoc> = {}): FuelLogDoc {
  return {
    id: "fuel-1",
    pk: "user@example.com",
    type: "fuelLog",
    date: "2024-01-15",
    createdAt: "2024-01-15T00:00:00.000Z",
    litres: 12.5,
    cost: 20,
    mileage: 5000,
    filledToFull: true,
    ...overrides,
  };
}

const emptyHistory: HistoryPoint[] = [];
const emptyPending: Record<ReviewCategory, string[]> = { service: [], fuel: [], mods: [], bills: [] };

function renderCard(props: Partial<Parameters<typeof FuelLogCard>[0]> = {}) {
  return render(
    <FuelLogCard
      log={makeLog()}
      distanceUnit="mi"
      currency="GBP"
      rates={null}
      pendingReviewIds={emptyPending}
      mileageHistory={emptyHistory}
      currentMileage={4000}
      {...props}
    />
  );
}

describe("FuelLogCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("shows litres, the full-tank tag, cost, date, distance and price-per-litre in view mode", () => {
    renderCard({ log: makeLog({ litres: 10, cost: 15, mileage: 5000, filledToFull: true, date: "2024-02-10" }) });
    expect(screen.getByText("10.0 L (full tank)")).toBeInTheDocument();
    expect(screen.getByText("£15")).toBeInTheDocument();
    expect(screen.getByText(/10 Feb 2024/)).toBeInTheDocument();
    expect(screen.getByText(/5,000 miles/)).toBeInTheDocument();
    expect(screen.getByText(/£1\.50\/litre/)).toBeInTheDocument();
  });

  it("omits the '(full tank)' suffix for a partial fill", () => {
    renderCard({ log: makeLog({ filledToFull: false, litres: 8 }) });
    expect(screen.getByText("8.0 L")).toBeInTheDocument();
  });

  it("shows a mileage-confidence tag with the real label text when the record carries one", () => {
    renderCard({ log: makeLog({ mileageConfidence: "estimated" }) });
    expect(screen.getByText(/\(mileage estimated\)/)).toBeInTheDocument();
  });

  it("shows nothing extra when there is no mileage confidence tag at all", () => {
    renderCard({ log: makeLog() });
    expect(screen.queryByText(/mileage estimated|mileage interpolated|mileage confirmed/)).not.toBeInTheDocument();
  });

  it("shows the original-currency note when the record was converted from another currency", () => {
    renderCard({
      log: makeLog({
        currencyConversion: { originalCurrency: "EUR", originalAmount: 25, rate: 0.85, ratedAt: "2024-01-15T00:00:00.000Z" },
      }),
    });
    expect(screen.getByText(/Originally 25\.00 EUR/)).toBeInTheDocument();
    expect(screen.getByText(/15 Jan 2024 rate/)).toBeInTheDocument();
  });

  it("links to the attachment through the authenticated attachment route, not a raw blob URL", () => {
    renderCard({
      log: makeLog({
        attachments: [{ blobName: "abc123", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2024-01-01T00:00:00.000Z" }],
      }),
    });
    expect(screen.getByRole("link", { name: "receipt.jpg" })).toHaveAttribute(
      "href",
      "/api/tracker/attachment/abc123"
    );
  });

  it("a scanner-created record with no specific conflict shows the generic auto-created banner and its AI description", () => {
    renderCard({ log: makeLog({ needsReview: true, aiDescription: "Fuel receipt from Shell, 15 Jan." }) });
    expect(screen.getByText(/Auto-created from a scanned receipt/)).toBeInTheDocument();
    expect(screen.getByText("Fuel receipt from Shell, 15 Jan.")).toBeInTheDocument();
  });

  it("a scanner-created record flagged for a mileage conflict shows that specific warning instead of the generic one", () => {
    renderCard({
      log: makeLog({ needsReview: true, mileageConflictWarning: "This is lower than an entry from three days later." }),
    });
    expect(screen.getByText(/This is lower than an entry from three days later\./)).toBeInTheDocument();
    expect(screen.queryByText(/Auto-created from a scanned receipt/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });

  it("Resolve looks up the conflicting entry and opens the real conflict-resolution modal on success", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/tracker/mileage-conflict-lookup")) {
        return { ok: true, json: async () => ({ referenceId: "ref-1", referenceCategory: "service" }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCard({ log: makeLog({ needsReview: true, mileageConflictWarning: "Conflict!" }) });

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/tracker/mileage-conflict-lookup?category=fuel&id=fuel-1"
    );
    // Proof the real MileageConflictModal mounted and made its own
    // request for the reference entry (mocked generically to fail here,
    // since this file's job is FuelLogCard's own wiring, not that
    // modal's internals).
    expect(await screen.findByText("Could not load the other entry.")).toBeInTheDocument();
  });

  it("Resolve shows its own error when the lookup itself fails, without opening the modal", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/tracker/mileage-conflict-lookup")) {
        return { ok: false, json: async () => ({ error: "Could not find the conflicting entry." }) };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCard({ log: makeLog({ needsReview: true, mileageConflictWarning: "Conflict!" }) });

    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not find the conflicting entry.");
    expect(screen.queryByText("Loading the other entry…")).not.toBeInTheDocument();
  });

  it("Edit opens the form pre-filled with values converted into the display distance and currency units", async () => {
    const user = userEvent.setup();
    renderCard({
      log: makeLog({ litres: 10, cost: 20, mileage: 10000 }), // 10000 miles
      distanceUnit: "km",
      currency: "EUR",
      rates: { base: "GBP", rates: { EUR: 1.17 }, fetchedAt: "2024-01-01T00:00:00.000Z" },
    });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Litres")).toHaveValue(10);
    expect(screen.getByLabelText("Cost paid (€)")).toHaveValue(23.4); // 20 * 1.17
    expect(screen.getByLabelText("Mileage (km)")).toHaveValue(16093); // round(10000 * 1.60934)
  });

  it("Cancel discards edits and returns to the view without ever calling the server", async () => {
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Litres"));
    await user.type(screen.getByLabelText("Litres"), "99");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Save sends the real edited values, converted back to GBP/miles, as a PATCH to this record's endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCard({
      log: makeLog({ id: "fuel-9", litres: 10, cost: 20, mileage: 5000, filledToFull: true }),
      currency: "EUR",
      rates: { base: "GBP", rates: { EUR: 1.17 }, fetchedAt: "2024-01-01T00:00:00.000Z" },
      currentMileage: 4000,
    });
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Mileage (miles)"));
    await user.type(screen.getByLabelText("Mileage (miles)"), "6000");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tracker/fuel/fuel-9",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            litres: 10,
            cost: 20, // 23.4 EUR displayed converted back to GBP via round(23.4/1.17)=20
            mileage: 6000,
            date: "2024-01-15",
            filledToFull: true,
            attachments: [],
            mileageAcknowledged: false,
          }),
        })
      )
    );
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("blocks Save entirely for a today-dated entry lower than the bike's current mileage, with no way to override it", async () => {
    const user = userEvent.setup();
    renderCard({ log: makeLog({ date: new Date().toISOString().slice(0, 10), mileage: 3000 }), currentMileage: 4000 });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText(/can't be lower than your bike's current recorded/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    // Blocked status offers no acknowledgement checkbox at all.
    expect(screen.queryByLabelText("Yes, this mileage is correct")).not.toBeInTheDocument();
  });

  it("only warns (doesn't block) a mileage that conflicts with an earlier history point, and unblocks once acknowledged", async () => {
    const user = userEvent.setup();
    renderCard({
      log: makeLog({ date: "2024-01-10", mileage: 4000 }),
      mileageHistory: [{ date: "2024-01-05", mileage: 4500 }],
      currentMileage: 5000,
    });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText(/If this is correct, confirm below\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByLabelText("Yes, this mileage is correct"));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Delete asks for confirmation first and does nothing if declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    renderCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith("Delete this fuel entry? This can't be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete sends a real DELETE once confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderCard({ log: makeLog({ id: "fuel-7" }) });
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tracker/fuel/fuel-7",
        expect.objectContaining({ method: "DELETE" })
      )
    );
  });

  it("after a needs-review save, hands off to the next pending item in the SAME category via the shared TabSwitchContext", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const onSwitchTab = vi.fn();
    const user = userEvent.setup();

    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <FuelLogCard
          log={makeLog({ id: "fuel-A", needsReview: true })}
          distanceUnit="mi"
          currency="GBP"
          rates={null}
          pendingReviewIds={{ service: [], fuel: ["fuel-A", "fuel-B"], mods: [], bills: [] }}
          mileageHistory={emptyHistory}
          currentMileage={4000}
        />
        <FuelLogCard
          log={makeLog({ id: "fuel-B" })}
          distanceUnit="mi"
          currency="GBP"
          rates={null}
          pendingReviewIds={{ service: [], fuel: ["fuel-A", "fuel-B"], mods: [], bills: [] }}
          mileageHistory={emptyHistory}
          currentMileage={4000}
        />
      </TabSwitchProvider>
    );

    const editButtons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);
    await user.click(screen.getAllByRole("button", { name: "Save" })[0]);

    // fuel-B never had Edit clicked directly - it should have opened its
    // own edit form automatically because it's still pending in the same
    // category and fuel-A (the one just saved) is excluded.
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Save" })).toHaveLength(1));
    expect(onSwitchTab).not.toHaveBeenCalled(); // stayed on the same tab, no category switch needed
  });

  it("highlights the card and scrolls it into view when TabSwitchContext marks it, then clears the highlight after a few seconds", async () => {
    vi.useFakeTimers();
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;

    function Trigger({ id }: { id: string }) {
      const { setHighlightIds } = useTabSwitch();
      return (
        <button type="button" onClick={() => setHighlightIds([id])}>
          trigger
        </button>
      );
    }

    render(
      <TabSwitchProvider onSwitchTab={() => {}}>
        <Trigger id="fuel-1" />
        <FuelLogCard
          log={makeLog({ id: "fuel-1" })}
          distanceUnit="mi"
          currency="GBP"
          rates={null}
          pendingReviewIds={emptyPending}
          mileageHistory={emptyHistory}
          currentMileage={4000}
        />
      </TabSwitchProvider>
    );

    fireEvent.click(screen.getByText("trigger"));
    expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });

    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
  });
});
