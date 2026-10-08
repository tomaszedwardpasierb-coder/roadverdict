// Place at: tests/components/AccountsTable.test.tsx
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { AccountsTable, type AccountRow } from "@/app/tomasz/AccountsTable";
import type { AccountStatus } from "@/lib/admin/accountActivity";

const NOW = Date.now();
const daysAgo = (n: number) => new Date(NOW - n * 86400000).toISOString();

function row(email: string, status: AccountStatus, opts: Partial<AccountRow> & { usesApp?: boolean; created?: number; entries?: number } = {}): AccountRow {
  return {
    email,
    createdAt: daysAgo(opts.created ?? 40),
    blocked: false,
    plan: null,
    vehicleAllowance: null,
    onboarding: false,
    tags: opts.tags ?? [],
    activity: {
      lastSeenAt: null,
      lastClient: null,
      lastActivityAt: daysAgo(status === "active" ? 1 : status === "cooling" ? 10 : 50),
      status,
      activeDays14: 0,
      entries14: opts.entries ?? 0,
      vehicles: status === "never-started" ? 0 : 1,
      usesApp: !!opts.usesApp,
      spark30: Array(30).fill(0),
      clientByDay: Array(30).fill(null),
      sessions: 0,
      entriesTotal: 0,
    },
  };
}

const ROWS = [
  row("inactive@example.com", "inactive"),
  row("active@example.com", "active", { entries: 5 }),
  row("tester@example.com", "cooling", { tags: ["tester"], usesApp: true, created: 0 }),
  row("new@example.com", "never-started", { usesApp: true, created: 0 }),
];

function emailsInOrder(): string[] {
  return screen.getAllByRole("checkbox", { name: /^Select .+@/ }).map((c) => c.getAttribute("aria-label")!.replace("Select ", ""));
}

describe("AccountsTable", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });

  it("counts each colour and the testers in the filter chips", () => {
    render(<AccountsTable rows={ROWS} defaultSince="2026-10-07" />);
    expect(screen.getByRole("button", { name: /All \(4\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Active \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Inactive \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Never started \(1\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Testers \(1\)/ })).toBeInTheDocument();
  });

  it("sorts by colour - active first - and filters to one colour", () => {
    render(<AccountsTable rows={ROWS} defaultSince="2026-10-07" />);
    expect(emailsInOrder()).toEqual(["active@example.com", "tester@example.com", "inactive@example.com", "new@example.com"]);
    fireEvent.click(screen.getByRole("button", { name: /Testers \(1\)/ }));
    expect(emailsInOrder()).toEqual(["tester@example.com"]);
  });

  it("selects app sign-ups since a date and offers the bulk actions", () => {
    render(<AccountsTable rows={ROWS} defaultSince={new Date(NOW - 86400000).toISOString().slice(0, 10)} />);
    expect(screen.queryByRole("region", { name: "Bulk actions" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    const bar = screen.getByRole("region", { name: "Bulk actions" });
    expect(within(bar).getByText("2 selected")).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Tag as tester" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Give Pro until" })).toBeInTheDocument();
  });

  it("copies the selected emails", async () => {
    render(<AccountsTable rows={ROWS} defaultSince="2026-10-07" />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select active@example.com" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy emails" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("active@example.com");
    expect(await screen.findByRole("status")).toHaveTextContent("Copied 1 email");
  });
});
