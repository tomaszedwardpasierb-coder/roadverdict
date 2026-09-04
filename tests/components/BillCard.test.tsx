// Place at: tests/components/BillCard.test.tsx
//
// BillCard is one bill record's card: a view/edit toggle, a real
// useTrackerFormSubmit (PATCH/DELETE against /api/tracker/bills/[id]),
// and the scanner-origin "needsReview" flow that jumps to the next
// pending record on save via TabSwitchContext's goToNextReview. Only
// fetch, next/navigation's useRouter, and two browser APIs jsdom doesn't
// implement (window.confirm, Element.scrollIntoView) are mocked -
// everything else (currency/date formatting, the real edit form, the
// real TabSwitchProvider) runs for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BillCard } from "@/app/dashboard/BillCard";
import { TabSwitchProvider, type ReviewCategory } from "@/app/dashboard/TabSwitchContext";
import type { BillDoc } from "@/lib/tracker/bill";

const mockRouter = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

// jsdom has no layout engine, so it doesn't implement scrollIntoView at
// all (unlike scrollTo, which tests/components/setup.ts already
// polyfills) - BillCard's highlight effect calls it on a real ref, which
// would otherwise throw in any test that triggers a highlight.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const emptyPendingReviewIds: Record<ReviewCategory, string[]> = { service: [], fuel: [], mods: [], bills: [] };

function makeBill(overrides: Partial<BillDoc> = {}): BillDoc {
  return {
    id: "bill-1",
    pk: "user@example.com",
    type: "bill",
    billType: "insurance",
    cost: 300,
    date: "2024-01-15",
    notes: "Annual renewal",
    createdAt: "2024-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("BillCard", () => {
  beforeEach(() => {
    mockRouter.refresh.mockClear();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the real bill in view mode: label, formatted cost, and date", () => {
    const bill = makeBill();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    expect(screen.getByText("Insurance")).toBeInTheDocument();
    expect(screen.getByText("£300")).toBeInTheDocument();
    expect(screen.getByText(fmtDate("2024-01-15"))).toBeInTheDocument();
    expect(screen.getByText("Annual renewal")).toBeInTheDocument();
  });

  it("shows the needs-review banner and AI description only for scanner-origin bills", () => {
    const bill = makeBill({ needsReview: true, aiDescription: "Looks like an MOT invoice from a garage." });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    expect(screen.getByText(/Auto-created from a scanned receipt/)).toBeInTheDocument();
    expect(screen.getByText("Looks like an MOT invoice from a garage.")).toBeInTheDocument();
  });

  it("shows the DVSA-recorded mileage note only when mileage is present", () => {
    const bill = makeBill({ billType: "mot-test", mileage: 12345 });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);
    expect(screen.getByText(/DVSA-recorded mileage:/)).toBeInTheDocument();
    expect(screen.getByText(/12,345 miles/)).toBeInTheDocument();
  });

  it("shows a 'not shown in buyer report' tag for insurance when includeInsuranceInReport is false", () => {
    const bill = makeBill({ billType: "insurance" });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" includeInsuranceInReport={false} />);
    expect(screen.getByText("Not shown in buyer report")).toBeInTheDocument();
  });

  it("hides the tag once includeInsuranceInReport is true", () => {
    const bill = makeBill({ billType: "insurance" });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" includeInsuranceInReport />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });

  it("never shows the tag for a non-insurance bill type, regardless of the setting", () => {
    const bill = makeBill({ billType: "road-tax" });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" includeInsuranceInReport={false} />);
    expect(screen.queryByText("Not shown in buyer report")).not.toBeInTheDocument();
  });

  it("shows the currency-conversion note when the bill was auto-converted", () => {
    const bill = makeBill({
      currencyConversion: { originalCurrency: "EUR", originalAmount: 350, rate: 0.85, ratedAt: "2024-01-14" },
    });
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);
    expect(screen.getByText(/Originally 350.00 EUR/)).toBeInTheDocument();
  });

  it("clicking Edit opens a form pre-filled with the bill's real values", async () => {
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Date")).toHaveValue("2024-01-15");
    expect(screen.getByLabelText("Type")).toHaveValue("insurance");
    expect(screen.getByLabelText(/Cost/)).toHaveValue(300);
    expect(screen.getByLabelText("Notes")).toHaveValue("Annual renewal");
  });

  it("Cancel returns to view mode without ever calling fetch", async () => {
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Save PATCHes the real edited form state to the bill's own endpoint", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const costInput = screen.getByLabelText(/Cost/);
    await user.clear(costInput);
    await user.type(costInput, "325");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Edit" }); // back in view mode
    // "Insurance" has its own reminder default (12 months), and the
    // remind checkbox defaults to checked whenever one exists - so the
    // real submitted body includes that reminder even though the test
    // never touched the reminder controls itself.
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bills/bill-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          billType: "insurance",
          cost: 325,
          date: "2024-01-15",
          notes: "Annual renewal",
          attachments: [],
          reminder: { intervalType: "months", intervalValue: 12 },
        }),
      })
    );
  });

  it("shows the server's own error message and stays in edit mode when the save fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Could not save this bill." }) });
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save this bill.");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument(); // still editing
  });

  it("Delete asks for confirmation and only calls fetch when confirmed", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("Delete, once confirmed, DELETEs the bill's own endpoint", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const bill = makeBill();
    const user = userEvent.setup();
    render(<BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={emptyPendingReviewIds} distanceUnit="mi" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bills/bill-1",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("saving a needs-review bill with nothing else pending in its own category switches to the next category's pending item", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const bill = makeBill({ needsReview: true });
    const onSwitchTab = vi.fn();
    const pendingReviewIds: Record<ReviewCategory, string[]> = { service: ["svc-1"], fuel: [], mods: [], bills: ["bill-1"] };
    const user = userEvent.setup();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={pendingReviewIds} distanceUnit="mi" />
      </TabSwitchProvider>
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Edit" });
    expect(onSwitchTab).toHaveBeenCalledWith("service");
  });

  it("saving a needs-review bill with more pending in its own category does NOT switch tabs", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const bill = makeBill({ needsReview: true });
    const onSwitchTab = vi.fn();
    const pendingReviewIds: Record<ReviewCategory, string[]> = { service: [], fuel: [], mods: [], bills: ["bill-1", "bill-2"] };
    const user = userEvent.setup();
    render(
      <TabSwitchProvider onSwitchTab={onSwitchTab}>
        <BillCard bill={bill} currency="GBP" rates={null} pendingReviewIds={pendingReviewIds} distanceUnit="mi" />
      </TabSwitchProvider>
    );

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await screen.findByRole("button", { name: "Edit" });
    expect(onSwitchTab).not.toHaveBeenCalled();
  });
});
