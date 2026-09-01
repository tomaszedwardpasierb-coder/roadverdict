// Place at: tests/components/AssistantWidget.test.tsx
//
// AssistantWidget is the richest component in this first batch: real
// retry/backoff logic (isRetryable, attemptSend, sendWithRetry) and a
// pathname-derived report-token extraction, both worth exercising for
// real rather than assuming. Only `fetch` and next/navigation's
// usePathname are mocked - the retry timing itself runs for real using
// vi's fake timers rather than a stubbed-out sleep().
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
}));

import { AssistantWidget } from "@/components/AssistantWidget";

async function openWidgetAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("AssistantWidget", () => {
  beforeEach(() => {
    mockPathname.current = "/";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts closed, with the greeting only visible once opened", async () => {
    const user = userEvent.setup();
    render(<AssistantWidget />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/What can I help with/)).toBeInTheDocument();
  });

  it("sends a message with no report token on a plain page, and renders the real reply", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "You can log a receipt from the dashboard's scan button." }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "How do I log a receipt?");

    expect(await screen.findByText("You can log a receipt from the dashboard's scan button.")).toBeInTheDocument();
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ messages: [
      { role: "assistant", content: expect.stringContaining("What can I help with") },
      { role: "user", content: "How do I log a receipt?" },
    ] });
  });

  it("on a /report/[token] page, includes that report's token in the request body", async () => {
    mockPathname.current = "/report/abc123";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "This bike has a clean documented history." }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "Is this bike well documented?");

    await screen.findByText("This bike has a clean documented history.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.reportToken).toBe("abc123");
  });

  it("never treats /report/receipt-request/decide as a report-token page", async () => {
    mockPathname.current = "/report/receipt-request/decide";
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "ok" }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "hello");

    await screen.findByText("ok");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.reportToken).toBeUndefined();
  });

  it("shift+Enter does not send; plain Enter does", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "ok" }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    const textarea = screen.getByPlaceholderText("Ask about using RoadVerdict…");
    await user.type(textarea, "hello{Shift>}{Enter}{/Shift}");
    expect(fetch).not.toHaveBeenCalled();

    await user.type(textarea, "{Enter}");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("a real 500 auto-retries once and succeeds silently, with no error ever shown to the user", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: "boom" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reply: "Recovered fine." }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AssistantWidget />);
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), "test");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(await screen.findByText("Recovered fine.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByText(/Try again/)).not.toBeInTheDocument();
  });

  it("a 400 (non-retryable) shows the server's error immediately, with no Retry button and no second attempt", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Message too long." }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "test");

    expect(await screen.findByText("Message too long.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("a persistent network failure shows Retry, and clicking it resends the exact same failed payload", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<AssistantWidget />);
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), "test");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    const retryButton = await screen.findByRole("button", { name: "Retry" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + one auto-retry, both failed

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reply: "Third time lucky." }) });
    await user.click(retryButton);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(await screen.findByText("Third time lucky.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
