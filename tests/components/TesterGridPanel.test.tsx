// Place at: tests/components/TesterGridPanel.test.tsx
//
// The tester grid on /tomasz: a row per tester, a green square per active day,
// and totals worded for Google's production-access form.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TesterGridPanel } from "@/app/tomasz/TesterGridPanel";
import { lastDays, type TesterGrid } from "@/lib/admin/testerReport";

const NOW = new Date("2026-10-08T12:00:00Z");
const DAYS = lastDays(14, NOW);

function cells(...on: number[]): boolean[] {
  const c = Array(14).fill(false);
  for (const i of on) c[i] = true;
  return c;
}

const grid: TesterGrid = {
  days: DAYS,
  rows: [
    { email: "busy@example.com", joinedAt: "2026-10-06T08:00:00.000Z", lastSeenAt: "2026-10-08T09:00:00.000Z", usesApp: true, cells: cells(13, 12, 11), activeDays: 3, entries: 8, receiptScans: 4 },
    { email: "quiet@example.com", joinedAt: "2026-10-07T08:00:00.000Z", lastSeenAt: null, usesApp: false, cells: cells(), activeDays: 0, entries: 0, receiptScans: 0 },
  ],
  totals: { testers: 2, signedInToApp: 1, active: 1, entries: 8, receiptScans: 4 },
};

describe("TesterGridPanel", () => {
  it("explains how to tag testers when there are none", () => {
    render(<TesterGridPanel grid={{ days: DAYS, rows: [], totals: { testers: 0, signedInToApp: 0, active: 0, entries: 0, receiptScans: 0 } }} scansFrom={null} scansUnavailable={false} now={NOW} />);
    expect(screen.getByText(/No account is tagged/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("shows the five totals", () => {
    render(<TesterGridPanel grid={grid} scansFrom="2026-10-08T07:00:00.000Z" scansUnavailable={false} now={NOW} />);
    for (const label of ["Testers", "Signed in to the app", "Used it in the last 14 days", "Entries logged", "Receipts scanned"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("writes the sentence for Google's form from the totals", () => {
    render(<TesterGridPanel grid={grid} scansFrom="2026-10-08T07:00:00.000Z" scansUnavailable={false} now={NOW} />);
    expect(
      screen.getByText(/In the last 14 days, 1 of our 2 testers used RoadVerdict on at least one day\. 1 signed in to the app, and between them they logged 8 entries and scanned 4 receipts\./)
    ).toBeInTheDocument();
  });

  it("draws one row per tester with a square for each of the 14 days, green where they used it", () => {
    render(<TesterGridPanel grid={grid} scansFrom={null} scansUnavailable={false} now={NOW} />);
    const rows = screen.getAllByRole("row").slice(1); // skip the header
    expect(rows).toHaveLength(2);
    const busy = within(rows[0]);
    expect(busy.getAllByRole("img")).toHaveLength(14);
    expect(busy.getAllByRole("img", { name: /^Used it on/ })).toHaveLength(3);
    expect(busy.getAllByRole("img", { name: /^Did not use it on/ })).toHaveLength(11);
    expect(within(rows[1]).queryAllByRole("img", { name: /^Used it on/ })).toHaveLength(0);
  });

  it("shows each tester's days, entries, scans and last seen, marking app users", () => {
    render(<TesterGridPanel grid={grid} scansFrom={null} scansUnavailable={false} now={NOW} />);
    expect(screen.getByText(/busy@example\.com \(app\)/)).toBeInTheDocument();
    expect(screen.getByText("quiet@example.com")).toBeInTheDocument();
    expect(screen.getByText("3h ago")).toBeInTheDocument();
    expect(screen.getByText("never")).toBeInTheDocument();
  });

  it("says what receipt scans are counted from, or that they can't be loaded", () => {
    const { rerender } = render(<TesterGridPanel grid={grid} scansFrom="2026-10-08T07:00:00.000Z" scansUnavailable={false} now={NOW} />);
    expect(screen.getByText(/receipt scans counted from 8 Oct 2026/)).toBeInTheDocument();
    rerender(<TesterGridPanel grid={grid} scansFrom={null} scansUnavailable={false} now={NOW} />);
    expect(screen.getByText(/no receipt scans recorded yet/)).toBeInTheDocument();
    rerender(<TesterGridPanel grid={grid} scansFrom={null} scansUnavailable now={NOW} />);
    expect(screen.getByText(/receipt scans could not be loaded/)).toBeInTheDocument();
  });
});
