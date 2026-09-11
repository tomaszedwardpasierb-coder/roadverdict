// Place at: tests/components/LabourCard.test.tsx
//
// LabourCard is the Labour record card - the same shape as ModCard
// (read view, an edit form, mileage-consistency check, needsReview
// banner with its own "resolve the conflict" sub-flow), except there is
// no separate free-text "name" field: the catalog label itself IS the
// description, and there's a single Category select (LABOUR_GROUPS is
// flat, unlike Mods' deeper subgroup nesting), so no "Group" select
// exists to test separately.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { LabourCard } from "@/app/dashboard/LabourCard";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";
import type { LabourDoc } from "@/lib/tracker/labour";
import type { HistoryPoint } from "@/lib/tracker/mileageCheck";

const baseLabour: LabourDoc = {
  id: "labour-1",
  pk: "rider@example.com",
  type: "labour",
  date: "2026-01-15",
  createdAt: "2026-01-15T00:00:00.000Z",
  category: "brake-bleeding",
  cost: 45,
  mileage: 12000,
  notes: "",
};

const emptyPendingIds = { service: [], fuel: [], mods: [], bills: [], labour: [] };

function FocusDisplay() {
  const { focusId } = useTabSwitch();
  return <div data-testid="focus-id">{focusId ?? "none"}</div>;
}

function renderLabourCard(
  props: Partial<Parameters<typeof LabourCard>[0]> = {},
  { onSwitchTab = vi.fn() }: { onSwitchTab?: (category: any) => void } = {}
) {
  const mergedProps = {
    labour: baseLabour,
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
      <LabourCard {...mergedProps} />
      <FocusDisplay />
    </TabSwitchProvider>
  );
  return { ...utils, onSwitchTab };
}

describe("LabourCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the real category label, formatted cost, date and mileage", () => {
    renderLabourCard();
    expect(screen.getByText("Brake bleeding")).toBeInTheDocument();
    expect(screen.getByText("£45.00")).toBeInTheDocument();
    expect(screen.getByText(/15 Jan 2026 · 12,000 miles/)).toBeInTheDocument();
  });

  it("shows the confirmed-mileage tag with its real label text", () => {
    renderLabourCard({ labour: { ...baseLabour, mileageConfidence: "confirmed" } });
    expect(screen.getByText(/mileage confirmed - AI-assisted entry/)).toBeInTheDocument();
  });

  it("renders notes and an attachment thumbnail when present", () => {
    renderLabourCard({
      labour: {
        ...baseLabour,
        notes: "Front and rear",
        attachments: [{ blobName: "abc.jpg", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-15T00:00:00.000Z" }],
      },
    });
    expect(screen.getByText("Front and rear")).toBeInTheDocument();
    expect(screen.getByAltText("receipt.jpg")).toBeInTheDocument();
  });

  it("shows the specific conflict warning and a Resolve button when mileageConflictWarning is set", () => {
    renderLabourCard({ labour: { ...baseLabour, needsReview: true, mileageConflictWarning: "Mileage is lower than an earlier record." } });
    expect(screen.getByText(/Mileage is lower than an earlier record\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });

  it("clicking Resolve looks up the conflicting record and opens the conflict modal on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/tracker/mileage-conflict-lookup")) {
        return Promise.resolve({ ok: true, json: async () => ({ referenceId: "ref-1", referenceCategory: "service" }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "ref-1", category: "service", date: "2026-01-01", mileage: 13000, label: "Full service", cost: 80, attachment: null }),
      });
    });

    const user = userEvent.setup();
    renderLabourCard({ labour: { ...baseLabour, needsReview: true, mileageConflictWarning: "Mileage conflict detected." } });
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/mileage-conflict-lookup?category=labour&id=labour-1");
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
  });

  it("Edit opens a form pre-filled with the record's real values", async () => {
    const user = userEvent.setup();
    renderLabourCard({ labour: { ...baseLabour, notes: "Front and rear" } });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(45);
    expect(screen.getByLabelText("Mileage (miles)")).toHaveValue(12000);
    expect(screen.getByLabelText("Notes")).toHaveValue("Front and rear");
    expect(screen.getByLabelText("Category")).toHaveValue("brake-bleeding");
  });

  it("searching for an exact catalog item's label sets the category", async () => {
    const user = userEvent.setup();
    renderLabourCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Search for a labour job"), "Coolant replacement");

    expect(screen.getByLabelText("Category")).toHaveValue("coolant-replacement");
  });

  it("a mileage conflict against logged history blocks Save until acknowledged, then allows it", async () => {
    const history: HistoryPoint[] = [{ id: "h1", category: "service", date: "2026-02-01", mileage: 9000 }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderLabourCard({ mileageHistory: history });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByText(/If this is correct, confirm below\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Yes, this mileage is correct" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("Save submits a real PATCH body and closes edit mode on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ id: "labour-1" }) });

    const user = userEvent.setup();
    renderLabourCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Cost (£)"));
    await user.type(screen.getByLabelText("Cost (£)"), "50");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/labour/labour-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          category: "brake-bleeding",
          cost: 50,
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
    renderLabourCard(
      { labour: { ...baseLabour, needsReview: true }, pendingReviewIds: { ...emptyPendingIds, labour: ["labour-1", "labour-2"] } },
      { onSwitchTab }
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByTestId("focus-id");
    expect(screen.getByTestId("focus-id")).toHaveTextContent("labour-2");
    expect(onSwitchTab).not.toHaveBeenCalled();
  });

  it("after saving a needsReview record with nothing left pending here, switches to the next category that has something pending", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const onSwitchTab = vi.fn();

    const user = userEvent.setup();
    renderLabourCard(
      { labour: { ...baseLabour, needsReview: true }, pendingReviewIds: { ...emptyPendingIds, labour: ["labour-1"], bills: ["bill-1"] } },
      { onSwitchTab }
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByText("Brake bleeding");
    expect(onSwitchTab).toHaveBeenCalledWith("bills");
    expect(screen.getByTestId("focus-id")).toHaveTextContent("bill-1");
  });

  it("shows the server's own error and stays in edit mode when Save responds not-ok", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Something specific went wrong." }) });

    const user = userEvent.setup();
    renderLabourCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong.");
    expect(screen.getByLabelText("Category")).toBeInTheDocument();
  });

  it("Delete asks for confirmation and does nothing if declined", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    const user = userEvent.setup();
    renderLabourCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(confirm).toHaveBeenCalledWith("Delete this labour entry? This can't be undone.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete sends a real DELETE request once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderLabourCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await within(document.body).findByRole("button", { name: "Delete" });
    expect(fetch).toHaveBeenCalledWith("/api/tracker/labour/labour-1", expect.objectContaining({ method: "DELETE" }));
  });
});
