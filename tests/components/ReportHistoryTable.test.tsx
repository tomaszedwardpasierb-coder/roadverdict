// Place at: tests/components/ReportHistoryTable.test.tsx
//
// The buyer-facing history table on a shared report. Backdating
// (isBackdated/backdateNotice) and pre-production-year detection
// (isBeforeProduction) are real library calls, not mocked - exercised
// here through realistic date fixtures rather than re-asserting their
// own already-tested internals. Only `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReportHistoryTable } from "@/app/report/[token]/ReportHistoryTable";
import type { ReportRow, EntryRequestStatus } from "@/lib/tracker/sellerReportData";
import type { BikeDoc } from "@/lib/tracker/bike";
import type { Attachment } from "@/lib/tracker/cosmosHelpers";

const bike: BikeDoc = {
  id: "bike-1",
  pk: "owner@example.com",
  type: "bike",
  make: "Honda",
  model: "CBR600RR",
  engineCC: 600,
  bikeClass: "medium",
  year: 2018,
  currentMileage: 20000,
  startingMileage: 5000,
  nickname: "Blade",
  dateAdded: "2020-01-01T00:00:00Z",
};

function attachment(overrides: Partial<Attachment> = {}): Attachment {
  return { blobName: "blob1", fileName: "receipt.pdf", fileType: "application/pdf", uploadedAt: "2024-01-01T00:00:00Z", ...overrides };
}

function row(overrides: Partial<ReportRow> & { id: string }): ReportRow {
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
  bike,
  token: "tok1",
  backdatedCount: 0,
  realTimeCount: 0,
  receiptCount: 0,
  entryRequestStatus: {} as Record<string, EntryRequestStatus>,
};

describe("ReportHistoryTable", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a friendly empty state and no table when there are no rows", () => {
    render(<ReportHistoryTable {...baseTableProps} rows={[]} total={0} />);
    expect(screen.getByText(/No service, modification, or bill history has been logged/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the backdate/receipt summary line with real counts when either applies", () => {
    const rows = [row({ id: "r1" })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} backdatedCount={1} realTimeCount={0} receiptCount={1} />);
    expect(screen.getByText(/0 of 1 entries were logged close to when the work was done/)).toBeInTheDocument();
    expect(screen.getByText(/1 was added later, see the notes below/)).toBeInTheDocument();
    expect(screen.getByText(/1 of 1.*has a receipt or invoice attached/)).toBeInTheDocument();
  });

  it("omits the summary line entirely when there's no backdating and no receipts at all", () => {
    const rows = [row({ id: "r1" })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} backdatedCount={0} receiptCount={0} realTimeCount={1} />);
    expect(screen.queryByText(/entries were logged close to when the work was done/)).not.toBeInTheDocument();
  });

  it("renders the correctly formatted total logged spend in the footer", () => {
    const rows = [row({ id: "r1", cost: 45.5 }), row({ id: "r2", cost: 12.25 })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={57.75} />);
    expect(screen.getByText("Total logged spend")).toBeInTheDocument();
    expect(screen.getByText("£57.75")).toBeInTheDocument();
  });

  it("flags a modification logged before the bike's own production year as pre-purchase", () => {
    const rows = [row({ id: "r1", category: "Modification", date: "2015-05-01", createdAt: "2015-05-01T00:00:00Z" })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.getByText("Pre-purchase expense (bought before 2018)")).toBeInTheDocument();
  });

  it("does not flag a service entry (only modifications) even if it predates the production year", () => {
    const rows = [row({ id: "r1", category: "Service", date: "2015-05-01", createdAt: "2015-05-01T00:00:00Z" })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.queryByText(/Pre-purchase expense/)).not.toBeInTheDocument();
  });

  it("shows a backdate note appending '(receipt attached)' only when the late-logged entry has a receipt", () => {
    const rows = [
      row({ id: "r1", description: "No-receipt job", date: "2023-01-01", createdAt: "2024-06-01T00:00:00Z", attachment: null }),
      row({ id: "r2", description: "Receipted job", date: "2023-01-01", createdAt: "2024-06-01T00:00:00Z", attachment: attachment({ blobName: "b2" }) }),
    ];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={91} backdatedCount={2} realTimeCount={0} receiptCount={1} />);

    const notices = screen.getAllByText(/Logged .* after the claimed date/);
    expect(notices).toHaveLength(2);
    expect(screen.getByText(/Logged .* after the claimed date \(receipt attached\)/)).toBeInTheDocument();
  });

  it("shows '- none provided' when there's no attachment at all", () => {
    const rows = [row({ id: "r1", attachment: null })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.getByText("- none provided")).toBeInTheDocument();
  });

  it("renders a viewable image thumbnail link for an approved image receipt", () => {
    const rows = [row({ id: "r1", attachment: attachment({ blobName: "img1", fileType: "image/jpeg" }) })];
    const entryRequestStatus = { r1: { status: "approved", requestCreatedAt: "2024-01-01T00:00:00Z", canRemind: false } as EntryRequestStatus };
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    const link = screen.getByRole("link", { name: /View/ });
    expect(link).toHaveAttribute("href", "/api/tracker/report-attachment/tok1/img1");
    expect(link.querySelector("img")).toBeInTheDocument();
  });

  it("renders a PDF tag (not an image) for an approved non-image receipt", () => {
    const rows = [row({ id: "r1", attachment: attachment({ blobName: "doc1", fileType: "application/pdf" }) })];
    const entryRequestStatus = { r1: { status: "approved", requestCreatedAt: "2024-01-01T00:00:00Z", canRemind: false } as EntryRequestStatus };
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("shows the decline reason and an 'Ask again anyway' control for a declined receipt", async () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = {
      r1: { status: "declined", reason: "Lost the paperwork", requestCreatedAt: "2024-01-01T00:00:00Z", canRemind: false } as EntryRequestStatus,
    };
    const user = userEvent.setup();
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByText("Lost the paperwork")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ask again anyway" }));
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("shows a pending tag with elapsed time, disabling Remind unless canRemind is true", async () => {
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = { r1: { status: "pending", requestCreatedAt: recent, canRemind: false } as EntryRequestStatus };
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByText(/Requested 2 hours ago/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remind" })).toBeDisabled();
  });

  it("clicking an enabled Remind button posts to this report's remind endpoint and shows 'Reminded'", async () => {
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    const rows = [row({ id: "r1", attachment: attachment() })];
    const entryRequestStatus = { r1: { status: "pending", requestCreatedAt: recent, canRemind: true } as EntryRequestStatus };
    const user = userEvent.setup();
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} entryRequestStatus={entryRequestStatus} />);

    await user.click(screen.getByRole("button", { name: "Remind" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/report/tok1/remind",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ entryId: "r1" }) })
    );
    expect(await screen.findByRole("button", { name: "Reminded" })).toBeDisabled();
  });

  it("shows an available checkbox for a selectable receipt with no prior request", () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.getByText(/Available on request/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("shows bulk-select controls only once more than one row is selectable, with per-category counts", async () => {
    const rows = [
      row({ id: "r1", category: "Service", attachment: attachment({ blobName: "a" }) }),
      row({ id: "r2", category: "Modification", attachment: attachment({ blobName: "b" }) }),
      row({
        id: "r3",
        category: "Bills",
        attachment: attachment({ blobName: "c" }),
      }),
    ];
    const entryRequestStatus = { r3: { status: "approved", requestCreatedAt: "2024-01-01T00:00:00Z", canRemind: false } as EntryRequestStatus };
    const user = userEvent.setup();
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={91} entryRequestStatus={entryRequestStatus} />);

    expect(screen.getByRole("button", { name: "Select all (2)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Service (1)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Modification (1)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bills/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select all (2)" }));
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(2);
  });

  it("hides bulk-select controls when at most one row is selectable", () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);
    expect(screen.queryByRole("button", { name: /Select all/ })).not.toBeInTheDocument();
  });

  it("selecting a receipt and submitting a request sends only the selected ids and the optional message", async () => {
    const rows = [row({ id: "r1", attachment: attachment({ blobName: "a" }) }), row({ id: "r2", attachment: attachment({ blobName: "b" }) })];
    const user = userEvent.setup();
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={91} />);

    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.type(screen.getByPlaceholderText(/A short note for the seller/), "Thanks!");
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/report/tok1/request-receipts",
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
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.click(screen.getByRole("button", { name: "Send request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Too many pending requests.");
    expect(screen.getByRole("button", { name: "Send request" })).toBeInTheDocument();
  });

  it("cancelling the request form keeps the selection but hides the message box", async () => {
    const rows = [row({ id: "r1", attachment: attachment() })];
    const user = userEvent.setup();
    render(<ReportHistoryTable {...baseTableProps} rows={rows} total={45.5} />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Request 1 receipt" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByPlaceholderText(/A short note for the seller/)).not.toBeInTheDocument();
    expect(screen.getByText("1 receipt selected")).toBeInTheDocument();
  });
});
