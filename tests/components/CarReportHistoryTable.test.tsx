// Place at: tests/components/CarReportHistoryTable.test.tsx
//
// Car mirror of ReportHistoryTable.test.tsx. Backdating (isBackdated/
// backdateNotice) and pre-production-year detection (isBeforeProduction)
// are real library calls, not mocked - exercised here through realistic
// date fixtures rather than re-asserting their own already-tested
// internals. Only `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarReportHistoryTable } from "@/app/car-report/[token]/CarReportHistoryTable";
import type { CarReportRow } from "@/lib/tracker/carSellerReportData";
import type { EntryRequestStatus } from "@/lib/tracker/sellerReportData";
import type { CarDoc } from "@/lib/tracker/car";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

const car: CarDoc = {
  id: "car-1",
  pk: "owner@example.com",
  type: "car",
  make: "Ford",
  model: "Focus",
  fuelType: "petrol",
  year: 2018,
  currentMileage: 20000,
  startingMileage: 5000,
  nickname: "The Runabout",
  dateAdded: "2020-01-01T00:00:00Z",
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return { blobName: "blob1", fileName: "receipt.pdf", fileType: "application/pdf", uploadedAt: "2024-01-01T00:00:00Z", ...overrides };
}

function row(overrides: Partial<CarReportRow> & { id: string }): CarReportRow {
  return {
    date: "2024-01-10",
    createdAt: "2024-01-10T00:00:00Z",
    category: "Service",
    description: "Oil change",
    cost: 45.5,
    attachment: null,
    ...overrides,
  };
}

const baseTableProps = {
  car,
  token: "tok1",
  backdatedCount: 0,
  realTimeCount: 0,
  receiptCount: 0,
  entryRequestStatus: {} as Record<string, EntryRequestStatus>,
};

describe("CarReportHistoryTable", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a friendly empty state and no table when there are no rows", () => {
    render(<CarReportHistoryTable {...baseTableProps} rows={[]} total={0} />);
    expect(screen.getByText(/No service, modification, or bill history has been logged/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders the correctly formatted total logged spend in the footer", () => {
    const rows = [row({ id: "r1", cost: 45.5 }), row({ id: "r2", cost: 12.25 })];
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={57.75} />);
    expect(screen.getByText("Total logged spend")).toBeInTheDocument();
    expect(screen.getByText("£57.75")).toBeInTheDocument();
  });

  it("flags a modification logged before the car's own production year as pre-purchase", () => {
    const rows = [row({ id: "r1", category: "Modification", date: "2015-05-01", createdAt: "2015-05-01T00:00:00Z" })];
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.getByText("Pre-purchase expense (bought before 2018)")).toBeInTheDocument();
  });

  it("shows the decline reason and an 'Ask again anyway' control for a declined receipt", async () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = {
      r1: { status: "declined", reason: "Lost the paperwork", requestCreatedAt: "2024-01-01T00:00:00Z", canRemind: false } as EntryRequestStatus,
    };
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByText("Lost the paperwork")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ask again anyway" }));
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows a pending tag with elapsed time, disabling Remind unless canRemind is true", () => {
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = { r1: { status: "pending", requestCreatedAt: recent, canRemind: false } as EntryRequestStatus };
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByText(/Requested 2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remind" })).toBeDisabled();
  });

  it("clicking an enabled Remind button posts to this report's remind endpoint and shows 'Reminded'", async () => {
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = { r1: { status: "pending", requestCreatedAt: recent, canRemind: true } as EntryRequestStatus };
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    await user.click(screen.getByRole("button", { name: "Remind" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/car-report/tok1/remind",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ entryId: "r1" }) })
    );
    expect(await screen.findByRole("button", { name: "Reminded" })).toBeDisabled();
  });

  it("shows the spinner on the Remind button while its request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = { r1: { status: "pending", requestCreatedAt: recent, canRemind: true } as EntryRequestStatus };
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    await user.click(screen.getByRole("button", { name: "Remind" }));

    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByRole("button", { name: "Reminded" });
  });

  it("shows an available checkbox for a selectable receipt with no prior request", () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.getByText(/Available on request/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("selecting a receipt and submitting a request sends only the selected ids and the optional message", async () => {
    const rows = [row({ id: "r1", attachment: attachment({ blobName: "a" }) }), row({ id: "r2", attachment: attachment({ blobName: "b" }) })];
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={91} />);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.type(screen.getByPlaceholderText(/A short note for the seller/), "Thanks!");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/car-report/tok1/request-receipts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ entryIds: ["r1"], buyerMessage: "Thanks!" }),
      })
    );
    expect(await screen.findByText(/Requested/)).toBeInTheDocument();
  });

  it("shows the server's error message and keeps the form open when the request submission fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Too many pending requests." }) });
    const rows = [row({ id: "r1", attachment: attachment() })];
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many pending requests.");
    expect(screen.getByRole("button", { name: "Send request" })).toBeInTheDocument();
  });

  it("shows the spinner on the Send request button while its request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const rows = [row({ id: "r1", attachment: attachment() })];
    const user = userEvent.setup();
    render(<CarReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    const button = screen.getByRole("button", { name: "Sending…" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({}) });
    await screen.findByText(/Requested/);
  });
});
