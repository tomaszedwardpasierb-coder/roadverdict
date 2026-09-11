// Place at: tests/components/CarLabourCard.test.tsx
//
// Car equivalent of LabourCard.test.tsx - same full-featured shape (see
// CarLabourCard.tsx's own top-of-file comment for why this isn't the
// simplified pattern every other car card, e.g. CarModCard.tsx, uses).
// The one real behavioural difference worth pinning down: the mileage-
// conflict lookup fetch must carry vehicleKind=car, and the modal itself
// must receive vehicleKind="car" so its own PATCH/DELETE calls hit the
// car routes, not the bike ones.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { CarLabourCard } from "@/app/dashboard/CarLabourCard";
import { TabSwitchProvider, useTabSwitch } from "@/app/dashboard/TabSwitchContext";
import type { CarLabourDoc } from "@/lib/tracker/carLabour";
import type { HistoryPoint } from "@/lib/tracker/mileageCheck";

const baseLabour: CarLabourDoc = {
  id: "car-labour-1",
  pk: "driver@example.com",
  type: "carLabour",
  carId: "car-1",
  date: "2026-01-15",
  createdAt: "2026-01-15T00:00:00.000Z",
  category: "hv-battery-health-check",
  cost: 60,
  mileage: 42000,
  notes: "",
};

const emptyPendingIds = { service: [], fuel: [], mods: [], bills: [], labour: [] };

function FocusDisplay() {
  const { focusId } = useTabSwitch();
  return <div data-testid="focus-id">{focusId ?? "none"}</div>;
}

function renderCarLabourCard(
  props: Partial<Parameters<typeof CarLabourCard>[0]> = {},
  { onSwitchTab = vi.fn() }: { onSwitchTab?: (category: any) => void } = {}
) {
  const mergedProps = {
    labour: baseLabour,
    distanceUnit: "mi" as const,
    currency: "GBP" as const,
    rates: null,
    pendingReviewIds: emptyPendingIds,
    mileageHistory: [] as HistoryPoint[],
    currentMileage: 45000,
    ...props,
  };
  const utils = render(
    <TabSwitchProvider onSwitchTab={onSwitchTab}>
      <CarLabourCard {...mergedProps} />
      <FocusDisplay />
    </TabSwitchProvider>
  );
  return { ...utils, onSwitchTab };
}

describe("CarLabourCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the real category label, formatted cost, date and mileage", () => {
    renderCarLabourCard();
    expect(screen.getByText("HV battery health check")).toBeInTheDocument();
    expect(screen.getByText("£60.00")).toBeInTheDocument();
    expect(screen.getByText(/15 Jan 2026 · 42,000 miles/)).toBeInTheDocument();
  });

  it("shows the specific conflict warning and a Resolve button when mileageConflictWarning is set", () => {
    renderCarLabourCard({ labour: { ...baseLabour, needsReview: true, mileageConflictWarning: "Mileage is lower than an earlier record." } });
    expect(screen.getByText(/Mileage is lower than an earlier record\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
  });

  it("clicking Resolve looks up the conflicting record with vehicleKind=car, and opens the conflict modal on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.includes("/api/tracker/mileage-conflict-lookup")) {
        return Promise.resolve({ ok: true, json: async () => ({ referenceId: "ref-1", referenceCategory: "fuel" }) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ id: "ref-1", category: "fuel", date: "2026-01-01", mileage: 43000, label: "Charge", cost: 20, attachment: null }),
      });
    });

    const user = userEvent.setup();
    renderCarLabourCard({ labour: { ...baseLabour, needsReview: true, mileageConflictWarning: "Mileage conflict detected." } });
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/mileage-conflict-lookup?category=labour&id=car-labour-1&vehicleKind=car");
    expect(await screen.findByText("Mileage conflict")).toBeInTheDocument();
  });

  it("Edit opens a form pre-filled with the record's real values", async () => {
    const user = userEvent.setup();
    renderCarLabourCard({ labour: { ...baseLabour, notes: "Annual check" } });
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2026-01-15");
    expect(screen.getByLabelText("Cost (£)")).toHaveValue(60);
    expect(screen.getByLabelText("Mileage (miles)")).toHaveValue(42000);
    expect(screen.getByLabelText("Notes")).toHaveValue("Annual check");
    expect(screen.getByLabelText("Category")).toHaveValue("hv-battery-health-check");
  });

  it("searching for an exact catalog item's label sets the category", async () => {
    const user = userEvent.setup();
    renderCarLabourCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByLabelText("Search for a labour job"), "Coolant replacement");

    expect(screen.getByLabelText("Category")).toHaveValue("coolant-replacement");
  });

  it("Save submits a real PATCH body to /api/cars/car-labour/[id] and closes edit mode on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ id: "car-labour-1" }) });

    const user = userEvent.setup();
    renderCarLabourCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Cost (£)"));
    await user.type(screen.getByLabelText("Cost (£)"), "65");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Edit" });
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/cars/car-labour/car-labour-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          category: "hv-battery-health-check",
          cost: 65,
          mileage: 42000,
          date: "2026-01-15",
          notes: "",
          attachments: [],
          mileageAcknowledged: false,
        }),
      })
    );
  });

  it("Delete sends a real DELETE request once confirmed", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });

    const user = userEvent.setup();
    renderCarLabourCard();
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await within(document.body).findByRole("button", { name: "Delete" });
    expect(fetch).toHaveBeenCalledWith("/api/cars/car-labour/car-labour-1", expect.objectContaining({ method: "DELETE" }));
  });
});
