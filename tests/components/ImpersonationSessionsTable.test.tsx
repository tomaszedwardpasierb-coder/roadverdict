// Place at: tests/components/ImpersonationSessionsTable.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ImpersonationSessionsTable } from "@/app/tomasz/ImpersonationSessionsTable";

describe("ImpersonationSessionsTable", () => {
  it("shows a plain empty-state message when there are no sessions", () => {
    render(<ImpersonationSessionsTable sessions={[]} />);
    expect(screen.getByText("No impersonation sessions logged yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders target account, reason, started date, and changes count for a completed session", () => {
    render(
      <ImpersonationSessionsTable
        sessions={[
          {
            sessionId: "s1",
            targetEmail: "rider@example.com",
            reason: "checking a support ticket",
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:15:00.000Z",
            durationMinutes: 15,
            ip: "1.2.3.4",
            changesCount: 3,
          },
        ]}
      />
    );

    expect(screen.getByText("rider@example.com")).toBeInTheDocument();
    expect(screen.getByText("checking a support ticket")).toBeInTheDocument();
    expect(screen.getByText("15 min")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows 'Still active / never exited' for a session with no matching end event", () => {
    render(
      <ImpersonationSessionsTable
        sessions={[
          { sessionId: "s1", targetEmail: "rider@example.com", reason: null, startedAt: "2026-01-01T00:00:00.000Z", endedAt: null, durationMinutes: null, ip: "1.2.3.4", changesCount: 0 },
        ]}
      />
    );

    expect(screen.getByText("Still active / never exited")).toBeInTheDocument();
  });

  it("shows 'Not given' when no reason was recorded", () => {
    render(
      <ImpersonationSessionsTable
        sessions={[
          { sessionId: "s1", targetEmail: "rider@example.com", reason: null, startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:10:00.000Z", durationMinutes: 10, ip: "1.2.3.4", changesCount: 0 },
        ]}
      />
    );

    expect(screen.getByText("Not given")).toBeInTheDocument();
  });

  it("formats a duration under an hour in minutes, and an hour-plus duration as h/m", () => {
    render(
      <ImpersonationSessionsTable
        sessions={[
          { sessionId: "short", targetEmail: "a@example.com", reason: "x", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T00:00:30.000Z", durationMinutes: 0, ip: "1.2.3.4", changesCount: 0 },
          { sessionId: "long", targetEmail: "b@example.com", reason: "x", startedAt: "2026-01-01T00:00:00.000Z", endedAt: "2026-01-01T01:30:00.000Z", durationMinutes: 90, ip: "1.2.3.4", changesCount: 0 },
        ]}
      />
    );

    expect(screen.getByText("<1 min")).toBeInTheDocument();
    expect(screen.getByText("1h 30m")).toBeInTheDocument();
  });
});
