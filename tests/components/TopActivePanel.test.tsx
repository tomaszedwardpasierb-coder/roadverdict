// Place at: tests/components/TopActivePanel.test.tsx
//
// The "most active" table on /tomasz: ranked accounts, with their tags so a
// tester or friend isn't mistaken for a customer.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { TopActivePanel } from "@/app/tomasz/TopActivePanel";
import type { TopActiveRow } from "@/lib/admin/testerReport";

const NOW = new Date("2026-10-08T12:00:00Z");

const rows: TopActiveRow[] = [
  { email: "first@example.com", tags: ["tester"], activeDays: 9, entries: 12, lastSeenAt: "2026-10-08T11:00:00.000Z", usesApp: true },
  { email: "second@example.com", tags: [], activeDays: 5, entries: 2, lastSeenAt: null, usesApp: false },
];

describe("TopActivePanel", () => {
  it("says so when nobody has used it in the last 14 days", () => {
    render(<TopActivePanel rows={[]} now={NOW} />);
    expect(screen.getByText(/No account has used RoadVerdict in the last 14 days/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("ranks the accounts in the order given, with days, entries and last seen", () => {
    render(<TopActivePanel rows={rows} now={NOW} />);
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(2);
    expect(within(body[0]).getByText("1")).toBeInTheDocument();
    expect(within(body[0]).getByText("first@example.com")).toBeInTheDocument();
    expect(within(body[0]).getByText("9")).toBeInTheDocument();
    expect(within(body[0]).getByText("12")).toBeInTheDocument();
    expect(within(body[0]).getByText("1h ago")).toBeInTheDocument();
    expect(within(body[1]).getByText("never")).toBeInTheDocument();
  });

  it("shows tags and marks app users", () => {
    render(<TopActivePanel rows={rows} now={NOW} />);
    expect(screen.getByText("tester")).toBeInTheDocument();
    expect(screen.getByText(/\(app\)/)).toBeInTheDocument();
  });
});
