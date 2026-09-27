import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBike: vi.fn(),
  getCarById: vi.fn(),
  getProStatus: vi.fn(),
  getSellerReportCore: vi.fn(),
  getCarSellerReportCore: vi.fn(),
  buildWalkAwayIssues: vi.fn(),
  buildCarWalkAwayIssues: vi.fn(),
}));

vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/subscriptions", () => ({ getProStatus: mocks.getProStatus }));
vi.mock("@/lib/tracker/sellerReportData", () => ({ getSellerReportCore: mocks.getSellerReportCore }));
vi.mock("@/lib/tracker/carSellerReportData", () => ({ getCarSellerReportCore: mocks.getCarSellerReportCore }));
vi.mock("@/lib/tracker/walkAwayRisks", () => ({ buildWalkAwayIssues: mocks.buildWalkAwayIssues }));
vi.mock("@/lib/tracker/carWalkAwayRisks", () => ({ buildCarWalkAwayIssues: mocks.buildCarWalkAwayIssues }));

import { getStory } from "@/lib/app/storyData";

const email = "rider@example.com";
const storyCache = {
  generatedAt: "2026-09-20T10:00:00.000Z",
  response: { sharedStory: ["It began..."], ownerNotes: ["Log the tyres"], verdict: { tier: "well-documented", label: "Well documented" } },
};
const evidenceQuality = {
  totalRecords: 12,
  receiptCount: 9,
  receiptCoveragePct: 75,
  realTimeCount: 10,
  realTimePct: 83,
  longestGapDays: 40,
  mileageInternallyConsistent: true,
};
const core = {
  evidenceQuality,
  mileageCheck: { consistent: true },
  upcomingCostItems: [
    { label: "Chain and sprockets", timing: "overdue", timingDetail: "due 300 miles ago", pricing: { status: "priced", low: 180, high: 260 } },
    { label: "Brake fluid", timing: "due-soon", timingDetail: "due in 2 months", pricing: { status: "not-priced" } },
  ],
  detailedQuestions: ["When were the tyres last changed?"],
};

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getProStatus.mockResolvedValue({ isPro: true });
  mocks.getBike.mockResolvedValue({ id: "bike-1" });
  mocks.getSellerReportCore.mockResolvedValue({ ...core, bike: { id: "bike-1", storyCache } });
  mocks.buildWalkAwayIssues.mockReturnValue([{ label: "Mileage", detail: "One reading goes backwards." }]);
});

describe("getStory", () => {
  it("returns null for a vehicle that isn't on this account, without building its report", async () => {
    mocks.getBike.mockResolvedValue(null);
    expect(await getStory(email, "bike", "not-mine")).toBeNull();
    expect(mocks.getSellerReportCore).not.toHaveBeenCalled();
  });

  it("gives a free account neither the story nor the selling prep - the web's whole tab is Pro", async () => {
    mocks.getProStatus.mockResolvedValue({ isPro: false });
    expect(await getStory(email, "bike", "bike-1")).toEqual({ isPro: false, story: null, sellerPrep: null });
    expect(mocks.getSellerReportCore).not.toHaveBeenCalled();
  });

  it("passes Pro the cached story with its next refresh a week after it was made", async () => {
    const r = (await getStory(email, "bike", "bike-1"))!;
    expect(r.story).toEqual({
      sharedStory: ["It began..."],
      ownerNotes: ["Log the tyres"],
      verdictLabel: "Well documented",
      generatedAt: "2026-09-20T10:00:00.000Z",
      nextAvailableAt: "2026-09-27T10:00:00.000Z",
    });
  });

  it("has no story until one has been generated", async () => {
    mocks.getSellerReportCore.mockResolvedValue({ ...core, bike: { id: "bike-1" } });
    expect((await getStory(email, "bike", "bike-1"))!.story).toBeNull();
  });

  it("builds the web's Getting ready to sell section from the buyer report's own facts", async () => {
    const r = (await getStory(email, "bike", "bike-1"))!;
    expect(r.sellerPrep).toMatchObject({
      totalRecords: 12,
      receiptCoveragePct: 75,
      realTimePct: 83,
      mileageConsistent: true,
      issues: [{ label: "Mileage", detail: "One reading goes backwards.", suggestion: expect.stringMatching(/typo/) }],
      upcoming: [
        { label: "Chain and sprockets", timingDetail: "due 300 miles ago", overdue: true, typical: "typically £180-£260" },
        { label: "Brake fluid", timingDetail: "due in 2 months", overdue: false, typical: null },
      ],
      questions: ["When were the tyres last changed?"],
    });
    // Receipts missing, one flagged issue, one overdue job, one question,
    // then the closing review step.
    expect(r.sellerPrep!.plan.map((s) => s.stage)).toEqual([
      "Attach missing receipts",
      "Resolve or explain flagged issues",
      "Consider handling overdue items now",
      "Prepare your answers",
      "Review your full record",
    ]);
  });

  it("uses the car report and car walk-away checks for a car", async () => {
    mocks.getCarById.mockResolvedValue({ id: "car-1" });
    mocks.getCarSellerReportCore.mockResolvedValue({ ...core, upcomingCostItems: [], detailedQuestions: [], car: { id: "car-1" } });
    mocks.buildCarWalkAwayIssues.mockReturnValue([]);
    const r = (await getStory(email, "car", "car-1"))!;
    expect(mocks.getCarSellerReportCore).toHaveBeenCalledWith(email, "car-1");
    expect(mocks.getSellerReportCore).not.toHaveBeenCalled();
    expect(r.story).toBeNull();
    expect(r.sellerPrep!.plan.map((s) => s.stage)).toEqual(["Attach missing receipts", "Review your full record"]);
  });
});
