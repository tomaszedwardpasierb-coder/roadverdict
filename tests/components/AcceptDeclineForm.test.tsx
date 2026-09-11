// Place at: tests/components/AcceptDeclineForm.test.tsx
//
// The bike-transfer accept/decline gate a recipient lands on from a
// transfer-offer link. Branches on the offer's own status, whether the
// visitor is signed in at all, and whether they're signed in as the
// actual recipient - decline is always available regardless of
// sign-in state, accept only once signed in as the right email. Only
// `fetch` is mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AcceptDeclineForm } from "@/app/bike-transfer/[token]/AcceptDeclineForm";

describe("AcceptDeclineForm", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows an already-decided message and no buttons when the offer isn't pending", () => {
    render(
      <AcceptDeclineForm token="tok1" status="accepted" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />
    );
    expect(screen.getByText("This offer has already been accepted.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("when signed out, shows a sign-in prompt and only the Decline button", () => {
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail={null} />);
    expect(screen.getByText(/Sign in or create a RoadVerdict account/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("when signed in as someone other than the recipient, shows a mismatch message and only Decline", () => {
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="someone-else@example.com" />);
    expect(screen.getByText(/you're signed in as/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("when signed in as the recipient, shows both Accept and Decline", () => {
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Decline" })).toBeInTheDocument();
  });

  it("accepting posts to this token's accept endpoint and shows the accepted confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/bike-transfer/tok1/accept", { method: "POST" });
    expect(await screen.findByText(/now appears on your account/)).toBeInTheDocument();
  });

  it("declining posts to this token's decline endpoint and shows the declined confirmation", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({}) });
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail={null} />);
    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(fetch).toHaveBeenCalledWith("/api/tracker/bike-transfer/tok1/decline", { method: "POST" });
    expect(await screen.findByText("Declined. Nothing has changed on either account.")).toBeInTheDocument();
  });

  it("shows the server's own error message when a decision fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "This offer has expired." }) });
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This offer has expired.");
  });

  it("shows a connection error, not an unhandled rejection, when fetch itself throws", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the server. Try again.");
  });

  // Pins the actual visual feedback this was built for - a button click
  // that's accepted but takes a moment shouldn't read as "did nothing
  // happen?" (see VehicleSpinner.tsx).
  it("shows the bike spinner alongside 'Please wait…' on both buttons while the accept request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail="buyer@example.com" />);
    await user.click(screen.getByRole("button", { name: "Accept" }));

    const buttons = screen.getAllByRole("button", { name: "Please wait…" });
    expect(buttons).toHaveLength(2);
    buttons.forEach((button) => {
      expect(button).toBeDisabled();
      expect(button.querySelector("svg")).toBeInTheDocument();
    });

    resolveFetch({ ok: true, json: async () => ({}) });
    expect(await screen.findByText(/now appears on your account/)).toBeInTheDocument();
  });

  it("shows the bike spinner alongside 'Please wait…' on the Decline button while its request is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const user = userEvent.setup();
    render(<AcceptDeclineForm token="tok1" status="pending" recipientEmail="buyer@example.com" signedInEmail={null} />);
    await user.click(screen.getByRole("button", { name: "Decline" }));

    const button = screen.getByRole("button", { name: "Please wait…" });
    expect(button).toBeDisabled();
    expect(button.querySelector("svg")).toBeInTheDocument();

    resolveFetch({ ok: true, json: async () => ({}) });
    expect(await screen.findByText("Declined. Nothing has changed on either account.")).toBeInTheDocument();
  });
});
