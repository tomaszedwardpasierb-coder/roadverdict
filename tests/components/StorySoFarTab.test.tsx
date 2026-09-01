// Place at: tests/components/StorySoFarTab.test.tsx
//
// StorySoFarTab talks to /api/tracker/story-so-far (see that route and
// BikeDoc.storyCache in src/lib/tracker/bike.ts for the real contract)
// and renders a deterministic "Getting ready to sell" section
// (SellerPrepSection) unconditionally alongside it. Only `fetch` is
// mocked - NotificationBell (rendered inside the header) makes its own
// real fetch to /api/tracker/notifications, so the stub below routes by
// URL rather than assuming a single call.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorySoFarTab } from "@/app/dashboard/StorySoFarTab";

const emptySellerPrep = {
  evidenceQuality: { totalRecords: 0, receiptCount: 0, receiptCoveragePct: 0, realTimeCount: 0, realTimePct: 0, longestGapDays: 0, mileageInternallyConsistent: true },
  prepIssues: [],
  upcomingCostItems: [],
  likelyQuestions: [],
  prepPlan: [],
};

const filledSellerPrep = {
  evidenceQuality: { totalRecords: 12, receiptCount: 9, receiptCoveragePct: 75, realTimeCount: 10, realTimePct: 83, longestGapDays: 40, mileageInternallyConsistent: false },
  prepIssues: [{ label: "Gap in service history", detail: "No records for 14 months.", suggestion: "Add anything you have from that period." }],
  upcomingCostItems: [
    { jobType: "tyres-pair", label: "Tyres (pair)", timing: "overdue" as const, timingDetail: "3,000 miles overdue", pricing: { status: "priced" as const, low: 120, high: 180, confidence: "higher" as const, sourceName: "x", lastReviewed: "2026-01-01" } },
  ],
  likelyQuestions: ["Has it ever been dropped?"],
  prepPlan: [{ stage: "Before listing", detail: "Fill the gap in your service history if you can." }],
};

function notificationsOkResponse() {
  return Promise.resolve({ ok: true, json: async () => ({ notifications: [], unreadCount: 0 }) });
}

function mockFetchRouter(storyHandler: (url: string, init?: RequestInit) => Promise<any>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/tracker/notifications") return notificationsOkResponse();
      return storyHandler(url, init);
    })
  );
}

describe("StorySoFarTab", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("with no story yet and no logged history, shows the empty-record message and no seller-prep detail", () => {
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={null} sellerPrep={emptySellerPrep} />
    );

    expect(screen.getByRole("button", { name: /Generate my story/ })).toBeInTheDocument();
    expect(screen.getByText(/Nothing logged yet/)).toBeInTheDocument();
    expect(screen.queryByText("Your record so far")).not.toBeInTheDocument();
  });

  it("with no story yet but real logged history, shows the seller-prep stats, issues, upcoming costs, questions and plan", () => {
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={null} sellerPrep={filledSellerPrep} />
    );

    expect(screen.getByText(/12 entries logged, 75% with a receipt attached, 83% entered in real time\./)).toBeInTheDocument();
    expect(screen.getByText(/At least one logged entry shows a lower mileage/)).toBeInTheDocument();
    expect(screen.getByText("Gap in service history")).toBeInTheDocument();
    expect(screen.getByText(/typically £120-£180/)).toBeInTheDocument();
    expect(screen.getByText("Has it ever been dropped?")).toBeInTheDocument();
    expect(screen.getByText(/Fill the gap in your service history/)).toBeInTheDocument();
  });

  it("shows the bike tag from nickname and registration together, separated by a dot", () => {
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    render(
      <StorySoFarTab
        bikeNickname="Betty"
        registration="AB12CDE"
        currentMileage={12000}
        distanceUnit="mi"
        initialStory={null}
        sellerPrep={emptySellerPrep}
      />
    );
    expect(screen.getByText(/Betty/)).toBeInTheDocument();
    expect(screen.getByText(/AB12CDE/)).toBeInTheDocument();
  });

  it("renders the current mileage converted for the display unit", () => {
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    render(
      <StorySoFarTab currentMileage={10000} distanceUnit="km" initialStory={null} sellerPrep={emptySellerPrep} />
    );
    // 10,000 miles -> ~16,093 km
    expect(screen.getByText(/16,093 km/)).toBeInTheDocument();
  });

  it("clicking Generate fetches a fresh story and renders it, including the AI-hidden owner notes", async () => {
    mockFetchRouter(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          generatedWithAi: true,
          sharedStory: ["This bike has a clean, well-documented history."],
          ownerNotes: ["One fuel receipt is missing a date."],
          verdict: { tier: "strong", label: "Well documented" },
          generatedAt: "2026-08-25T00:00:00.000Z",
          cached: false,
          nextAvailableAt: "2026-09-01T00:00:00.000Z",
        }),
      })
    );

    const user = userEvent.setup();
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={null} sellerPrep={emptySellerPrep} />
    );
    await user.click(screen.getByRole("button", { name: /Generate my story/ }));

    expect(await screen.findByText("This bike has a clean, well-documented history.")).toBeInTheDocument();
    expect(screen.getByText("Well documented")).toBeInTheDocument();
    expect(screen.getByText("One fuel receipt is missing a date.")).toBeInTheDocument();
    expect(screen.getByText("For you only - never shown to a buyer")).toBeInTheDocument();
    expect(screen.getByText(/Generated 25 Aug 2026/)).toBeInTheDocument();
  });

  it("an already-cached, persisted story renders directly from initialStory with no fetch on mount", () => {
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    const initialStory = {
      generatedWithAi: true,
      sharedStory: ["A steady commuter with regular servicing."],
      ownerNotes: [],
      verdict: { tier: "strong" as const, label: "Well documented", reasons: [] },
      generatedAt: "2026-08-01T00:00:00.000Z",
      cached: true,
      nextAvailableAt: "2026-09-05T00:00:00.000Z",
    };
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={initialStory} sellerPrep={emptySellerPrep} />
    );

    expect(screen.getByText("A steady commuter with regular servicing.")).toBeInTheDocument();
    expect(screen.queryByText("For you only - never shown to a buyer")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalledWith("/api/tracker/story-so-far");
  });

  it("shows the cooldown note and disables Regenerate while nextAvailableAt is still in the future", () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    const initialStory = {
      generatedWithAi: true,
      sharedStory: ["A steady commuter."],
      ownerNotes: [],
      verdict: { tier: "strong" as const, label: "Well documented", reasons: [] },
      generatedAt: "2026-08-01T00:00:00.000Z",
      cached: true,
      nextAvailableAt: future,
    };
    mockFetchRouter(() => Promise.reject(new Error("should not be called")));
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={initialStory} sellerPrep={emptySellerPrep} />
    );

    expect(screen.getByRole("button", { name: "Regenerate" })).toBeDisabled();
    expect(screen.getByText(/Stories refresh once a week/)).toBeInTheDocument();
    expect(screen.getByText(/Next refresh available in 3 days/)).toBeInTheDocument();
  });

  it("allows Regenerate once nextAvailableAt has passed, with no cooldown note shown", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const initialStory = {
      generatedWithAi: true,
      sharedStory: ["A steady commuter."],
      ownerNotes: [],
      verdict: { tier: "strong" as const, label: "Well documented", reasons: [] },
      generatedAt: "2026-08-01T00:00:00.000Z",
      cached: true,
      nextAvailableAt: past,
    };
    mockFetchRouter(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          generatedWithAi: true,
          sharedStory: ["A fresh new story."],
          ownerNotes: [],
          verdict: { tier: "strong", label: "Well documented" },
          generatedAt: "2026-09-01T00:00:00.000Z",
          cached: false,
          nextAvailableAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        }),
      })
    );

    const user = userEvent.setup();
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={initialStory} sellerPrep={emptySellerPrep} />
    );

    expect(screen.queryByText(/Stories refresh once a week/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Regenerate" }));

    expect(await screen.findByText("A fresh new story.")).toBeInTheDocument();
  });

  it("shows the server's own error message when generation responds not-ok", async () => {
    mockFetchRouter(() => Promise.resolve({ ok: false, json: async () => ({ error: "Something specific went wrong." }) }));

    const user = userEvent.setup();
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={null} sellerPrep={emptySellerPrep} />
    );
    await user.click(screen.getByRole("button", { name: /Generate my story/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Something specific went wrong.");
  });

  it("shows a connection error, not an unhandled rejection, when the story fetch itself throws", async () => {
    mockFetchRouter(() => Promise.reject(new Error("network down")));

    const user = userEvent.setup();
    render(
      <StorySoFarTab currentMileage={12000} distanceUnit="mi" initialStory={null} sellerPrep={emptySellerPrep} />
    );
    await user.click(screen.getByRole("button", { name: /Generate my story/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach the server/i);
  });
});
