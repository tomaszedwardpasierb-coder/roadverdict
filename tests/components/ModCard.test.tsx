// Place at: tests/components/ModCard.test.tsx
//
// ModCard is the "Parts & Accessories" record card: a read view, an edit
// form built from the (large, catalog-driven) MOD_GROUPS/MOD_LABELS
// hierarchy, a mileage-consistency check shared with every other tracker
// card, and a needsReview banner with its own "resolve the conflict"
// sub-flow. Only `fetch`, `next/navigation`'s useRouter (pulled in
// transitively via useTrackerFormSubmit) and `window.confirm` are
// mocked - real TabSwitchContext provider is used (not its no-provider
// fallback) so goToNextReview's real effect on focusId/switchTo is
// actually observable, not assumed.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { ModCard } from "@/app/dashboard/ModCard";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";
import type { ModDoc } from "@/lib/tracker/mod";
import type { HistoryPoint } from "@/lib/tracker/mileageCheck";

const baseMod: ModDoc = {
  id: "mod-1",
  pk: "rider@example.com",
  type: "mod",
  date: "2026-01-15",
  createdAt: "2026-01-15T00:00:00.000Z",
  category: "disc-lock",
  name: "Oxford disc lock",
  cost: 25,
  mileage: 12000,
  notes: "",
};

const emptyPendingIds = { service: [], fuel: [], mods: [], bills: [] };

function FocusDisplay() {
  const { focusId } = useTabSwitch();
  return <div data-testid="focus-id">{focusId ?? "none"}</div>;
}

function renderModCard(
  props: Partial<Parameters<typeof ModCard>[0]> = {},
  { onSwitchTab = vi.fn() }: { onSwitchTab?: (category: any) => void } = {}
) {
  const mergedProps = {
    mod: baseMod,
    distanceUnit: "mi" as const,
    currency: "GBP" as const,
    rates: null,
    pendingReviewIds: emptyPendingIds,
    mileageHistory: [] as HistoryPoint[],
    currentMileage: 15000,
    ...props,
  };
  const utils = render(
    <TabSwitchProvider onSwitchTab={onSwitchTab}>
      <ModCard {...mergedProps} />
      <FocusDisplay />
    </TabSwitchProvider>
  );
  return { ...utils, onSwitchTab };
}

describe("ModCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the real name, formatted cost, category label, date and mileage", () => {
    renderModCard();
    expect(screen.getByText("Oxford disc lock")).toBeInTheDocument();
    expect(screen.getByText("£25")).toBeInTheDocument();
    expect(screen.getByText(/Disc lock · 15 Jan 2026 · 12,000 miles/)).toBeInTheDocument();
  });

  it("shows the confirmed-mileage tag with its real label text", () => {
    renderModCard({ mod: { ...baseMod, mileageConfidence: "confirmed" } });
    expect(screen.getByText(/mileage confirmed - AI-assisted entry/)).toBeInTheDocument();
  });

  it("shows the estimated-mileage tag with its real label text", () => {
    renderModCard({ mod: { ...baseMod, mileageConfidence: "estimated" } });
    expect(screen.getByText(/\(mileage estimated\)/)).toBeInTheDocument();
  });

  it("renders a currency-conversion note using the record's real original amount and rate date", () => {
    renderModCard({
      mod: {
        ...baseMod,
        currencyConversion: { originalCurrency: "EUR", originalAmount: 30, rate: 0.85, ratedAt: "2026-01-10" },
      },
    });
    expect(screen.getByText(/Originally 30\.00 EUR, converted at the 10 Jan 2026 rate\./)).toBeInTheDocument();
  });

  it("renders notes and an attachment thumbnail when present", () => {
    renderModCard({
      mod: {
        ...baseMod,
        notes: "Fitted at home",
        attachments: [{ blobName: "abc.jpg", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-15T00:00:00.000Z" }],
      },
    });
    expect(screen.getByText("Fitted at home")).toBeInTheDocument();
    expect(screen.getByAltText("receipt.jpg")).toBeInTheDocument();
  });

  it("shows the generic scanner-review banner and any AI description when there's no mileage conflict", () => {
    renderModCard({ mod: { ...baseMod, needsReview: true, aiDescription: "Looks like a security accessory purchase." } });
    expect(screen.getByText(/Auto-created from a scanned receipt/)).toBeInTheDocument();
    expect(screen.getByText("Looks like a security accessory purchase.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Resolve|Finding it/ })).not.toBeInTheDocument();
  });

  it("shows the specific conflict warning and a Resolve button when mileageConflictWarning is set", () => {
    renderModCard({ mod: { ...baseMod, needsReview: true, mileageConflictWarning: "Mileage is lower than an earlier record." } });
    expect(screen.getByText(/Mileage is lower than an earlier record\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });

  it("clicking Resolve looks up the conflicting record and opens the conflict modal on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/tracker/mileage-conflict-lookup")) {
        return Promise.resolve({ ok: true, json: async () => ({ referenceId: "ref-1", referenceCategory: "service" }) });
      }
      // The modal's own fetch for the reference entry's detail.
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "ref-1", category: "service", date: "2026-01-01", mileage: 13000, label: "Full service", cost: 80, attachment: null }),
      });
    });

    const user = userEvent.setup();
    renderModCard({ mod: { ...baseMod, needsReview: true, mileageConflictWarning: "Mileage conflict detected." } });
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/mileage-conflict-lookup?category=mods&id=mod-1");
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
  });

  it("shows the server's own error when the conflict lookup responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not find the conflicting entry." }) });

    const user = userEvent.setup();
    renderModCard({ mod: { ...baseMod, needsReview: true, mileageConflictWarning: "Mileage conflict detected." } });
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not find the conflicting entry.");
  });

  it("shows a connection error, not an unhandled rejection, when the conflict lookup fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

    const user = userEvent.setup();
    renderModCard({ mod: { ...baseMod, needsReview: true, mileageConflictWarning: "Mileage conflict detected." } });
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server.");
  });

  it("Edit opens a form pre-filled with the record's real values", async () => {
    const user = userEvent.setup();
    renderModCard({ mod: { ...baseMod, notes: "Fitted at home" } });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("What is it?")).toHaveValue("Oxford disc lock");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(25);
    expect(screen.getByLabelText("Mileage (miles)")).toHaveValue(12000);
    expect(screen.getByLabelText("Notes")).toHaveValue("Fitted at home");
    expect(screen.getByLabelText("Group")).toHaveValue("Electronics & security");
    expect(screen.getByLabelText("Category")).toHaveValue("disc-lock");
  });

  it("changing Group resets Category to that group's first item", async () => {
    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.selectOptions(screen.getByLabelText("Group"), "Suspension & brakes");
    expect(screen.getByLabelText("Category")).toHaveValue("fork");
  });

  it("searching for an exact catalog item's label sets both its category and group", async () => {
    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Search for an item"), "Tank bag");

    expect(screen.getByLabelText("Group")).toHaveValue("Comfort & practicality");
    expect(screen.getByLabelText("Category")).toHaveValue("tank-bag");
  });

  it("a mileage conflict against logged history blocks Save until acknowledged, then allows it", async () => {
    const history: HistoryPoint[] = [{ id: "h1", category: "service", date: "2026-02-01", mileage: 9000 }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderModCard({ mileageHistory: history });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText(/If this is correct, confirm below\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Yes, this mileage is correct" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Save submits a real PATCH body, closes edit mode on success, and never has a needsReview record to advance", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ id: "mod-1" }) });

    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("What is it?"));
    await user.type(screen.getByLabelText("What is it?"), "Renamed lock");
    await user.click(screen.getByRole("button", { name: "Save" }));

    // The read view goes back to showing `mod` as it was passed in via
    // props (a real parent would re-fetch and pass a new `mod` after
    // router.refresh() runs inside useTrackerFormSubmit; that refresh is
    // itself mocked away here) - what's actually checked is that edit
    // mode closed and the real PATCH body carried the new name.
    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/mods/mod-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          category: "disc-lock",
          name: "Renamed lock",
          cost: 25,
          mileage: 12000,
          date: "2026-01-15",
          notes: "",
          attachments: [],
          mileageAcknowledged: false,
        }),
      })
    );
  });

  it("after saving a needsReview record with another one still pending in the same category, focuses that one next (no tab switch)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSwitchTab = vi.fn();

    const user = userEvent.setup();
    renderModCard(
      { mod: { ...baseMod, needsReview: true }, pendingReviewIds: { ...emptyPendingIds, mods: ["mod-1", "mod-2"] } },
      { onSwitchTab }
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByTestId("focus-id");
    expect(screen.getByTestId("focus-id")).toHaveTextContent("mod-2");
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it("after saving a needsReview record with nothing left pending here, switches to the next category that has something pending", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSwitchTab = vi.fn();

    const user = userEvent.setup();
    renderModCard(
      { mod: { ...baseMod, needsReview: true }, pendingReviewIds: { ...emptyPendingIds, mods: ["mod-1"], bills: ["bill-1"] } },
      { onSwitchTab }
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Oxford disc lock");
    expect(onSwitchTab).toHaveBeenCalledWith("bills");
    expect(screen.getByTestId("focus-id")).toHaveTextContent("bill-1");
  });

  it("shows the server's own error and stays in edit mode when Save responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something specific went wrong." }) });

    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong.");
    expect(screen.getByLabelText("What is it?")).toBeInTheDocument();
  });

  it("Delete asks for confirmation and does nothing if declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirm).toHaveBeenCalledWith("Delete this modification? This can't be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete sends a real DELETE request once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderModCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await within(document.body).findByRole("button", { name: "Delete" }); // still mounted (parent doesn't unmount on delete)
    expect(fetch).toHaveBeenCalledWith("/api/tracker/mods/mod-1", expect.objectContaining({ method: "DELETE" }));
  });
});
