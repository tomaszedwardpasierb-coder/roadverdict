// Place at: tests/components/AssistantWidget.test.tsx
//
// AssistantWidget is the richest component in this first batch: real
// retry/backoff logic (isRetryable, attemptSend, sendWithRetry) and a
// pathname-derived report-token extraction, both worth exercising for
// real rather than assuming. Only `fetch` and next/navigation's
// usePathname are mocked - the retry timing itself runs for real using
// vi's fake timers rather than a stubbed-out sleep().
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mockPathname = vi.hoisted(() => ({ current: "/" }));
const mockSearchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
const mockRouterRefresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname.current,
  useSearchParams: () => mockSearchParams.current,
  useRouter: () => ({ refresh: mockRouterRefresh }),
}));

import { AssistantWidget } from "@/components/AssistantWidget";
import { ActiveSectionProvider, useActiveSection } from "@/components/ActiveSectionContext";

// Mirrors how DashboardShell actually publishes the open tab in
// production (a useEffect syncing local state into the shared context)
// - a real child calling the real setter, not a mock.
function SetActiveSection({ section }: { section: string }) {
  const { setActiveSection } = useActiveSection();
  useEffect(() => setActiveSection(section), [section, setActiveSection]);
  return null;
}

async function openWidgetAndSend(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("button", { name: "Open assistant" }));
  await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
}

describe("AssistantWidget", () => {
  beforeEach(() => {
    mockPathname.current = "/";
    mockSearchParams.current = new URLSearchParams();
    mockRouterRefresh.mockReset();
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

  it("includes the currently-open dashboard tab, published via the shared ActiveSectionContext, in the request body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "Shareable Links let you send a buyer your bike's history." }),
    });

    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetActiveSection section="shareLinks" />
        <AssistantWidget />
      </ActiveSectionProvider>
    );
    await openWidgetAndSend(user, "what's this for?");

    await screen.findByText("Shareable Links let you send a buyer your bike's history.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.dashboardTab).toBe("shareLinks");
  });

  it("on /garage/compare, includes the currently-selected bike ids and date filter in the request body", async () => {
    mockPathname.current = "/garage/compare";
    mockSearchParams.current = new URLSearchParams([["bikes", "bike-1"], ["bikes", "bike-2"], ["from", "2025-01-01"]]);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ reply: "The Africa Twin is cheaper to run." }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "which is cheaper?");

    await screen.findByText("The Africa Twin is cheaper to run.");
    const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.compareBikeIds).toEqual(["bike-1", "bike-2"]);
    expect(body.compareFrom).toBe("2025-01-01");
    expect(body.compareTo).toBeUndefined();
  });

  it("never includes compare context on a page other than /garage/compare, even if the URL happens to have a bikes param", async () => {
    mockPathname.current = "/garage";
    mockSearchParams.current = new URLSearchParams([["bikes", "bike-1"], ["bikes", "bike-2"]]);
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
    expect(body.compareBikeIds).toBeUndefined();
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

  it("renders a proposed service entry card, pre-filled from the draft, alongside the assistant's reply", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        reply: "Here's a draft for that.",
        proposedEntry: {
          category: "service", jobType: "oil-filter", jobLabel: "Oil & filter change",
          description: "Valve cleaner", cost: 4, date: "2026-01-01", mileage: 15000,
        },
      }),
    });

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "log a valve cleaner for £4 today");

    await screen.findByText("Here's a draft for that.");
    expect(screen.getByText("New service record")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Valve cleaner")).toBeInTheDocument();
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2026-01-01")).toBeInTheDocument();
    expect(screen.getByDisplayValue("15000")).toBeInTheDocument();
  });

  it("confirming a proposed entry POSTs the edited draft to the services endpoint and shows it as logged", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          reply: "Here's a draft for that.",
          proposedEntry: {
            category: "service", jobType: "oil-filter", jobLabel: "Oil & filter change",
            description: "Valve cleaner", cost: 4, date: "2026-01-01", mileage: 15000,
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ record: { id: "svc-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "log a valve cleaner for £4 today");
    await screen.findByText("Here's a draft for that.");

    await user.clear(screen.getByLabelText("Cost (£)"));
    await user.type(screen.getByLabelText("Cost (£)"), "4.5");
    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByText(/Logged/);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/tracker/services", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ jobType: "oil-filter", cost: 4.5, mileage: 15000, date: "2026-01-01", notes: "Valve cleaner", mileageAcknowledged: false });
    expect(mockRouterRefresh).toHaveBeenCalled();
  });

  it("shows the server's error inline on the card, without disturbing the surrounding chat, when confirming fails", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          reply: "Here's a draft for that.",
          proposedEntry: { category: "bill", billType: "insurance", billLabel: "Insurance", description: "Annual renewal", cost: 300, date: "2026-01-01" },
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "Please fill in all required fields." }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "log my insurance renewal, £300 today");
    await screen.findByText("Here's a draft for that.");

    await user.click(screen.getByRole("button", { name: "Log it" }));

    expect(await screen.findByText("Please fill in all required fields.")).toBeInTheDocument();
    expect(screen.queryByText(/Logged/)).not.toBeInTheDocument();
  });

  it("confirming a proposed mod/accessory entry POSTs to the mods endpoint with category and name fields", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          reply: "Here's a draft for that.",
          proposedEntry: {
            category: "mod", modCategory: "other-accessory", modLabel: "Other accessory",
            description: "Szuwax detailing spray", cost: 12, date: "2026-01-01", mileage: 15000,
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ mod: { id: "mod-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "add new entry, szuwax, £12");
    await screen.findByText("Here's a draft for that.");
    expect(screen.getByText("New modification/accessory")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByText(/Logged/);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/tracker/mods", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ category: "other-accessory", name: "Szuwax detailing spray", cost: 12, mileage: 15000, date: "2026-01-01", mileageAcknowledged: false });
  });

  it("confirming a proposed fuel entry POSTs to the fuel endpoint with litres and no description field", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({
          reply: "Here's a draft for that.",
          proposedEntry: { category: "fuel", litres: 10, cost: 15, date: "2026-01-01", mileage: 15000, filledToFull: false },
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ log: { id: "fuel-1" } }) });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await openWidgetAndSend(user, "log 10 litres of fuel for £15 today");
    await screen.findByText("Here's a draft for that.");
    expect(screen.getByText("New fuel log")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log it" }));

    await screen.findByText(/Logged/);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/tracker/fuel", expect.objectContaining({ method: "POST" }));
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ litres: 10, cost: 15, mileage: 15000, date: "2026-01-01", filledToFull: false, mileageAcknowledged: false });
  });
});
