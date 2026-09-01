// Place at: tests/components/IncomingOwnershipRequestCard.test.tsx
//
// Approve/decline UI for an incoming bike-transfer request. Only fetch
// is mocked - the approve/decline branching and the three terminal
// render states (approved-with-records, approved-without-records,
// declined) all run for real.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IncomingOwnershipRequestCard } from "@/app/dashboard/IncomingOwnershipRequestCard";

describe("IncomingOwnershipRequestCard", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the requester's email and formatted request date", () => {
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);
    expect(screen.getByText(/buyer@example.com/)).toBeInTheDocument();
    expect(screen.getByText(/5 Mar 2026/)).toBeInTheDocument();
  });

  it("approving with records included posts includeRecords:true and shows the records-transferred message", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/bike-transfer/incoming/req-1/approve",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ includeRecords: true }) })
    );
    expect(await screen.findByText(/logged service records, fuel logs, mods, bills/)).toBeInTheDocument();
  });

  it("unchecking 'include records' before approving shows the records-stayed-private message instead", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);

    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ includeRecords: false }) })
    );
    expect(await screen.findByText(/stayed private on your own account/)).toBeInTheDocument();
  });

  it("declining sends no body and shows the declined message", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/bike-transfer/incoming/req-1/decline", expect.objectContaining({ method: "POST" }));
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1]).not.toHaveProperty("body");
    expect(await screen.findByText(/Declined\. Nothing has changed/)).toBeInTheDocument();
  });

  it("shows the server's own error message on a non-ok response, and lets the person retry", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "Already decided." }) });
    const user = userEvent.setup();
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);

    await user.click(screen.getByRole("button", { name: "Approve" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already decided.");
    expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
  });

  it("shows a connection error when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<IncomingOwnershipRequestCard requestId="req-1" requesterEmail="buyer@example.com" createdAt="2026-03-05" />);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Try again.");
  });
});
