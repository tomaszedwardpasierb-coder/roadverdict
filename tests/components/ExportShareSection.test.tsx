// Place at: tests/components/ExportShareSection.test.tsx
//
// ExportShareSection is two things bolted together: a CSV download link
// gated behind Pro (via the real ProGate component, not a stub), and a
// share-link creation flow with its own client-side validation, copy
// button and optional send-by-email step. Only `fetch` and
// navigator.clipboard are mocked.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportShareSection } from "@/app/dashboard/ExportShareSection";

describe("ExportShareSection", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    // Deliberately not stubbing navigator.clipboard ourselves:
    // @testing-library/user-event's own setup() unconditionally installs
    // its own real (in-memory, read/write-backed) Clipboard stub on
    // every navigator the moment userEvent.setup() runs, overwriting
    // anything defined beforehand - so the Copy test below verifies the
    // real write through that stub's own readText(), rather than a
    // vi.fn() that setup() would silently replace anyway.
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("free plan: the real CSV link is replaced by the Pro upsell, not shown alongside it", () => {
    render(<ExportShareSection isPro={false} />);
    expect(screen.queryByRole("link", { name: "Download CSV" })).not.toBeInTheDocument();
    expect(screen.getByText("Export as CSV")).toBeInTheDocument();
    expect(screen.getByText("Upgrade to Pro — £4.99/month")).toBeInTheDocument();
  });

  it("pro plan: the real CSV link is shown, pointing at the export route, with no upsell", () => {
    render(<ExportShareSection isPro={true} />);
    const link = screen.getByRole("link", { name: "Download CSV" });
    expect(link).toHaveAttribute("href", "/api/tracker/export/csv");
    expect(screen.queryByText("Export as CSV")).not.toBeInTheDocument();
  });

  it("blocks creating a link with no recipient email, without calling the server", async () => {
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter the email address/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks an email address with no @ as clearly invalid", async () => {
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/enter the email address/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks a non-numeric or non-positive asking price, but leaves it optional", async () => {
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.type(screen.getByLabelText("Asking price (optional)"), "-5");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid asking price, or leave it blank.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates a link with the real form state (duration, email, asking price) and renders the result", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://roadverdict.app/report/tok123", expiresAt: "2024-06-01T00:00:00.000Z" }),
    });
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.selectOptions(screen.getByLabelText("Link stays valid for"), "6months");
    await user.type(screen.getByLabelText("Asking price (optional)"), "3200");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));

    expect(await screen.findByDisplayValue("https://roadverdict.app/report/tok123")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/tracker/share-link",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ duration: "6months", recipientEmail: "buyer@example.com", askingPrice: 3200 }),
      })
    );
    expect(screen.getByText(/Valid until 1 Jun 2024/)).toBeInTheDocument();
    // The email-send step is pre-filled with the same address already given.
    expect(screen.getByPlaceholderText("Send to an email address")).toHaveValue("buyer@example.com");
  });

  it("shows the server's own error and stays on the form when link creation fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "You already have 5 active links." }),
    });
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("You already have 5 active links.");
    expect(screen.queryByDisplayValue(/report/)).not.toBeInTheDocument();
  });

  it("Copy writes the real share URL to the clipboard and reverts its label after a couple of seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ url: "https://roadverdict.app/report/tok123", expiresAt: null }),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));
    await screen.findByDisplayValue("https://roadverdict.app/report/tok123");

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await navigator.clipboard.readText()).toBe("https://roadverdict.app/report/tok123");
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("sends the link by email to the correct per-token endpoint, and clears the field on success", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://roadverdict.app/report/tok123", expiresAt: null }),
    });
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));
    await screen.findByDisplayValue("https://roadverdict.app/report/tok123");

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await user.click(screen.getByRole("button", { name: "Send by email" }));

    expect(await screen.findByText("Sent to buyer@example.com.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/tracker/share-link/tok123/send-email",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ toEmail: "buyer@example.com" }) })
    );
    expect(screen.getByPlaceholderText("Send to an email address")).toHaveValue("");
  });

  it("shows a connection error, not a crash, when sending the email itself fails to reach the server", async () => {
    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: "https://roadverdict.app/report/tok123", expiresAt: null }),
    });
    const user = userEvent.setup();
    render(<ExportShareSection isPro={false} />);
    await user.type(screen.getByLabelText("Sharing with (email address)"), "buyer@example.com");
    await user.click(screen.getByRole("button", { name: "Get shareable report link" }));
    await screen.findByDisplayValue("https://roadverdict.app/report/tok123");

    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await user.click(screen.getByRole("button", { name: "Send by email" }));

    expect(await screen.findByText("Could not reach the server.")).toBeInTheDocument();
  });
});
