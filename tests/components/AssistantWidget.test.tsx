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

// jsdom implements no version of the Web Speech API at all - this stands
// in for a real browser's SpeechRecognition, giving tests a handle on the
// exact instance the component creates (via `instances`) so they can
// simulate onresult/onerror/onend the way a real browser would drive
// them, and assert start()/stop() were actually called rather than just
// trusting the click handler ran.
class MockSpeechRecognition extends EventTarget {
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onend?.();
  });
  constructor() {
    super();
    MockSpeechRecognition.instances.push(this);
  }
  static instances: MockSpeechRecognition[] = [];
}

// Mirrors how DashboardShell actually publishes the open tab in
// production (a useEffect syncing local state into the shared context)
// - a real child calling the real setter, not a mock.
function SetActiveSection({ section }: { section: string }) {
  const { setActiveSection } = useActiveSection();
  useEffect(() => setActiveSection(section), [section, setActiveSection]);
  return null;
}

// Same pattern, for vehicleKind - see NavigationLoadingOverlay.tsx/
// VehicleSpinner.tsx for why this widget needs to know it too.
function SetVehicleKind({ kind }: { kind: "bike" | "car" }) {
  const { setVehicleKind } = useActiveSection();
  useEffect(() => setVehicleKind(kind), [kind, setVehicleKind]);
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
    MockSpeechRecognition.instances = [];
    // Deliberately NOT stubbed here, unlike fetch - support has to be
    // opted into per test (see the voice-input describe block below) so
    // the "hidden when unsupported" test reflects a real browser (like
    // Firefox) that has no SpeechRecognition global at all, the same way
    // the component's own getSpeechRecognitionConstructor() would see it.
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

  it("shows the spinner on the typing bubble and the Send button while a reply is in flight", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const user = userEvent.setup();
    render(<AssistantWidget />);
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    const sendButton = screen.getByRole("button", { name: "Send" });
    expect(sendButton).toBeDisabled();
    expect(sendButton.querySelector("svg")).toBeInTheDocument();
    // The typing-bubble spinner - a second, separate one from the Send
    // button's own - confirms the "assistant is composing a reply" cue
    // is a real animated wheel now, not just a static "…".
    expect(document.querySelectorAll("svg").length).toBeGreaterThanOrEqual(2);

    resolveFetch({ ok: true, status: 200, json: async () => ({ reply: "Done." }) });
    expect(await screen.findByText("Done.")).toBeInTheDocument();
    expect(sendButton.querySelector("svg")).not.toBeInTheDocument();
  });

  it("themes the sending spinner as a car wheel when ActiveSectionContext says the dashboard is car-active", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

    const user = userEvent.setup();
    render(
      <ActiveSectionProvider>
        <SetVehicleKind kind="car" />
        <AssistantWidget />
      </ActiveSectionProvider>
    );
    await user.click(screen.getByRole("button", { name: "Open assistant" }));
    await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));

    // The car wheel's own distinguishing feature (its alloy wedge spokes,
    // rendered as <path> elements) - the bike wheel's wire spokes are
    // plain <line> elements instead, see VehicleSpinner.test.tsx.
    expect(document.querySelectorAll("path").length).toBeGreaterThan(0);

    resolveFetch({ ok: true, status: 200, json: async () => ({ reply: "Done." }) });
    await screen.findByText("Done.");
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

  it("on /garage/compare, includes the currently-selected vehicle ids and date filter in the request body", async () => {
    mockPathname.current = "/garage/compare";
    mockSearchParams.current = new URLSearchParams([["vehicles", "bike-1"], ["vehicles", "car-1"], ["from", "2025-01-01"]]);
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
    expect(body.compareVehicleIds).toEqual(["bike-1", "car-1"]);
    expect(body.compareFrom).toBe("2025-01-01");
    expect(body.compareTo).toBeUndefined();
  });

  it("never includes compare context on a page other than /garage/compare, even if the URL happens to have a vehicles param", async () => {
    mockPathname.current = "/garage";
    mockSearchParams.current = new URLSearchParams([["vehicles", "bike-1"], ["vehicles", "bike-2"]]);
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
    expect(body.compareVehicleIds).toBeUndefined();
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
            description: "Valve cleaner", cost: 4, date: "2026-01-01", mileage: 15000, vehicleKind: "bike",
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
    expect(body).toEqual({
      jobType: "oil-filter", cost: 4.5, mileage: 15000, date: "2026-01-01", notes: "Valve cleaner", mileageAcknowledged: false,
      reminder: { intervalType: "mileage", intervalValue: 4000 },
    });
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

  describe("chat attachments", () => {
    const uploadedAttachment = { blobName: "abc123.jpg", fileName: "receipt.jpg", fileType: "image/jpeg", uploadedAt: "2026-01-01T00:00:00.000Z" };

    function makeFile(name = "receipt.jpg", type = "image/jpeg") {
      return new File(["file contents"], name, { type });
    }

    it("uploads the picked file immediately and shows it as a pending chip, before anything is sent", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ attachment: uploadedAttachment }) });
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));

      await user.upload(screen.getByLabelText("Choose a photo or file to attach"), makeFile());

      expect(await screen.findByText("receipt.jpg")).toBeInTheDocument();
      expect(fetch).toHaveBeenCalledWith("/api/tracker/upload-attachment", expect.objectContaining({ method: "POST" }));
      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect((init.body as FormData).get("file")).toBeInstanceOf(File);
    });

    it("removing the pending chip clears it, with no further fetch call", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ attachment: uploadedAttachment }) });
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.upload(screen.getByLabelText("Choose a photo or file to attach"), makeFile());
      await screen.findByText("receipt.jpg");

      await user.click(screen.getByRole("button", { name: "Remove attachment" }));

      expect(screen.queryByText("receipt.jpg")).not.toBeInTheDocument();
      expect(fetch).toHaveBeenCalledTimes(1); // only the original upload, no extra call from removing
    });

    it("shows the server's own upload error, without ever showing a pending chip", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({ error: "File too large." }) });
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));

      await user.upload(screen.getByLabelText("Choose a photo or file to attach"), makeFile());

      expect(await screen.findByText("File too large.")).toBeInTheDocument();
      expect(screen.queryByText("receipt.jpg")).not.toBeInTheDocument();
    });

    it("shows a distinct timed-out message when the upload stalls instead of rejecting", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      (fetch as ReturnType<typeof vi.fn>).mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      });
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.upload(screen.getByLabelText("Choose a photo or file to attach"), makeFile());

      await vi.advanceTimersByTimeAsync(45_000);

      expect(await screen.findByText("Upload timed out - try again.")).toBeInTheDocument();
      expect(screen.queryByText("receipt.jpg")).not.toBeInTheDocument();
      vi.useRealTimers();
    });

    it("sends the pending attachment's reference in the request body, shows it on the sent message's own bubble, and clears the pending chip", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: async () => ({ attachment: uploadedAttachment }) })
        .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ reply: "Got it, drafting that now." }) });
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.upload(screen.getByLabelText("Choose a photo or file to attach"), makeFile());
      await screen.findByText("receipt.jpg");

      await user.type(screen.getByPlaceholderText("Ask about using RoadVerdict…"), "Log this receipt");
      await user.click(screen.getByRole("button", { name: "Send" }));

      await screen.findByText("Got it, drafting that now.");
      const sendBody = JSON.parse(fetchMock.mock.calls[1][1].body);
      expect(sendBody.attachment).toEqual(uploadedAttachment);
      // Two "receipt.jpg" now: one on the sent user bubble, the pending
      // composer chip is gone - queryAllBy, not getBy, confirms exactly one.
      expect(screen.getAllByText("receipt.jpg")).toHaveLength(1);
    });

    it("never includes an attachment field at all when nothing was picked", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 200, json: async () => ({ reply: "Sure." }) });
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await openWidgetAndSend(user, "hello");

      await screen.findByText("Sure.");
      const body = JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(body.attachment).toBeUndefined();
    });

    it("renders a proposedVaultDocument card alongside the reply", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          reply: "Here's a draft for the Vault.",
          proposedVaultDocument: { category: "vaultDocument", vehicleKind: "bike", vehicleId: "bike-1", vaultCategory: "dvlaLegal", label: "V5C" },
        }),
      });
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await openWidgetAndSend(user, "Add my V5C to the vault");

      await screen.findByText("Here's a draft for the Vault.");
      expect(screen.getByText("Add to Vault")).toBeInTheDocument();
    });
  });

  describe("voice input", () => {
    it("hides the mic button entirely when the browser has no SpeechRecognition support", async () => {
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));

      expect(screen.queryByRole("button", { name: "Start voice input" })).not.toBeInTheDocument();
    });

    it("shows the mic button when supported, and starts recognition on click", async () => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));

      const micButton = await screen.findByRole("button", { name: "Start voice input" });
      await user.click(micButton);

      expect(MockSpeechRecognition.instances).toHaveLength(1);
      expect(MockSpeechRecognition.instances[0].start).toHaveBeenCalledTimes(1);
      expect(MockSpeechRecognition.instances[0].lang).toBe("en-GB");
      expect(MockSpeechRecognition.instances[0].interimResults).toBe(true);
      expect(await screen.findByRole("button", { name: "Stop voice input" })).toHaveAttribute("aria-pressed", "true");
    });

    it("clicking the mic again while listening stops recognition", async () => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));

      await user.click(screen.getByRole("button", { name: "Stop voice input" }));

      expect(MockSpeechRecognition.instances[0].stop).toHaveBeenCalledTimes(1);
      // stop() drives onend in this mock, exactly as a real browser would -
      // the button should fall back to its idle label and state.
      expect(await screen.findByRole("button", { name: "Start voice input" })).toHaveAttribute("aria-pressed", "false");
    });

    it("writes live speech results into the same input the textarea already shows, exactly like typing", async () => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));

      const recognition = MockSpeechRecognition.instances[0];
      act(() => {
        recognition.onresult?.({
          results: [[{ transcript: "check my fuel economy" }]],
        });
      });

      const textarea = screen.getByPlaceholderText("Listening…") as HTMLTextAreaElement;
      expect(textarea.value).toBe("check my fuel economy");
      // The real Send button reads from the exact same `input` state -
      // proof this isn't a separate, parallel field.
      expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
    });

    it("a permission-denied recognition error shows a permission-specific inline note", async () => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));

      const recognition = MockSpeechRecognition.instances[0];
      act(() => {
        recognition.onerror?.({ error: "not-allowed" });
      });

      expect(await screen.findByText(/microphone access is blocked/i)).toBeInTheDocument();
    });

    // Each real error code gets its own accurate message - previously
    // every one of these showed the same "check your microphone
    // permission" text, which is actively wrong for e.g. `network`
    // (the most common real-world cause: Chrome's built-in recognition
    // talks to a Google backend, so a firewall/DNS block surfaces as
    // `network` even with a working, permitted mic).
    it.each([
      ["network", /couldn't reach the voice service/i],
      ["audio-capture", /no microphone found/i],
      ["service-not-allowed", /voice input isn't available/i],
      ["some-unrecognised-future-code", /couldn't hear that - try again/i],
    ])("a '%s' recognition error shows its own specific message", async (errorCode, expectedText) => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));

      const recognition = MockSpeechRecognition.instances[0];
      act(() => {
        recognition.onerror?.({ error: errorCode });
      });

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
    });

    it.each(["no-speech", "aborted"])(
      "a '%s' recognition event is a normal outcome, shown to the user as no error at all",
      async (errorCode) => {
        vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
        const user = userEvent.setup();
        render(<AssistantWidget />);
        await user.click(screen.getByRole("button", { name: "Open assistant" }));
        await user.click(await screen.findByRole("button", { name: "Start voice input" }));

        const recognition = MockSpeechRecognition.instances[0];
        act(() => {
          recognition.onerror?.({ error: errorCode });
        });

        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      }
    );

    it("stops listening immediately when clicked again, even if the browser never fires onend", async () => {
      class NeverEndsMockSpeechRecognition extends MockSpeechRecognition {
        stop = vi.fn(); // deliberately does NOT call onend - simulates the real-world stuck case
      }
      vi.stubGlobal("SpeechRecognition", NeverEndsMockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));
      expect(await screen.findByRole("button", { name: "Stop voice input" })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: "Stop voice input" }));

      expect(await screen.findByRole("button", { name: "Start voice input" })).toHaveAttribute("aria-pressed", "false");
      expect(NeverEndsMockSpeechRecognition.instances[0].stop).toHaveBeenCalledTimes(1);
    });

    it("never gets stuck listening when start() throws synchronously", async () => {
      class ThrowsOnStartMockSpeechRecognition extends MockSpeechRecognition {
        start = vi.fn(() => {
          throw new Error("recognition already started");
        });
      }
      vi.stubGlobal("SpeechRecognition", ThrowsOnStartMockSpeechRecognition);
      const user = userEvent.setup();
      render(<AssistantWidget />);
      await user.click(screen.getByRole("button", { name: "Open assistant" }));
      await user.click(await screen.findByRole("button", { name: "Start voice input" }));

      expect(screen.getByRole("button", { name: "Start voice input" })).toHaveAttribute("aria-pressed", "false");
      expect(await screen.findByText(/couldn't start voice input/i)).toBeInTheDocument();
    });

    it("disables the mic button while a message is sending, same as the textarea and Send button", async () => {
      vi.stubGlobal("SpeechRecognition", MockSpeechRecognition);
      let resolveFetch: (v: unknown) => void = () => {};
      (fetch as ReturnType<typeof vi.fn>).mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));

      const user = userEvent.setup();
      render(<AssistantWidget />);
      await openWidgetAndSend(user, "hello");

      expect(await screen.findByRole("button", { name: "Start voice input" })).toBeDisabled();

      resolveFetch({ ok: true, status: 200, json: async () => ({ reply: "Done." }) });
      await screen.findByText("Done.");
    });
  });
});
