// generateStoryParagraphs and describeJobTypeGroup are reused directly
// (not duplicated) for cars - see carReportNarrative.ts's own comment -
// so they're not re-tested here; their coverage lives in
// tests/unit/reportNarrative.test.ts. Only the four functions actually
// mirrored (car-specific wording or the car job catalog) are covered.
import { describe, expect, it } from "vitest";
import {
  checkCurrentCarMileagePlausibility,
  groupCarServiceHistoryByJobType,
  generateCarSupportedAndUnconfirmed,
  generateCarDetailedQuestions,
} from "@/lib/tracker/carReportNarrative";
import type { JobTypeGroup } from "@/lib/tracker/reportNarrative";

describe("checkCurrentCarMileagePlausibility", () => {
  it("is plausible for an ordinary mileage on a car with a normal annual rate", () => {
    expect(checkCurrentCarMileagePlausibility(60000, { year: new Date().getFullYear() - 5 })).toEqual({ implausible: false });
  });

  // Cars legitimately rack up far more lifetime mileage than
  // motorcycles - this must NOT trip at the bike's own 250,000 ceiling.
  it("does not flag a high-but-realistic car mileage that would exceed the motorcycle-tuned ceiling", () => {
    expect(checkCurrentCarMileagePlausibility(300000, { year: new Date().getFullYear() - 15 })).toEqual({ implausible: false });
  });

  it("flags an absolute mileage above the car's own, higher realistic ceiling", () => {
    const result = checkCurrentCarMileagePlausibility(500000, {});
    expect(result.implausible).toBe(true);
    expect(result.reason).toContain("not a realistic reading for a car");
  });

  it("flags an implausible annual mileage rate for the car's age", () => {
    const result = checkCurrentCarMileagePlausibility(300000, { year: new Date().getFullYear() - 2 });
    expect(result.implausible).toBe(true);
    expect(result.reason).toContain("isn't realistic for ordinary use");
  });

  it("never applies the annual-rate check to a custom build, even at a high implied rate", () => {
    expect(checkCurrentCarMileagePlausibility(300000, { year: new Date().getFullYear() - 2, isCustomBuild: true })).toEqual({ implausible: false });
  });

  it("never applies the annual-rate check when the car has no recorded year", () => {
    expect(checkCurrentCarMileagePlausibility(300000, {})).toEqual({ implausible: false });
  });
});

describe("groupCarServiceHistoryByJobType", () => {
  const records = [
    { id: "r1", jobType: "oil-filter", date: "2025-01-01", cost: 40, hasReceipt: true },
    { id: "r2", jobType: "oil-filter", date: "2025-01-01", cost: 40, hasReceipt: false }, // exact duplicate of r1
    { id: "r3", jobType: "oil-filter", date: "2025-06-01", cost: 60, hasReceipt: true },
    { id: "r4", jobType: "cambelt", date: "2025-03-01", cost: 450, hasReceipt: false },
  ];

  it("groups records by job type, with each group's own count/dates/cost range/receipt count", () => {
    const groups = groupCarServiceHistoryByJobType(records);
    const oilGroup = groups.find((g) => g.jobType === "oil-filter")!;
    expect(oilGroup.count).toBe(3);
    expect(oilGroup.minCost).toBe(40);
    expect(oilGroup.maxCost).toBe(60);
    expect(oilGroup.totalCost).toBe(140);
    expect(oilGroup.receiptCount).toBe(2);
    expect(oilGroup.label).toBe("Oil & filter change");
  });

  it("counts entries sharing an identical date and cost within the same group as exact duplicates", () => {
    const groups = groupCarServiceHistoryByJobType(records);
    const oilGroup = groups.find((g) => g.jobType === "oil-filter")!;
    expect(oilGroup.exactDuplicateCount).toBe(2);
  });

  it("falls back to the raw job type as the label when it isn't a recognised one", () => {
    const groups = groupCarServiceHistoryByJobType([{ id: "r1", jobType: "made-up-job", date: "2025-01-01", cost: 10, hasReceipt: false }]);
    expect(groups[0].label).toBe("made-up-job");
  });

  it("sorts groups by total cost, highest first", () => {
    const groups = groupCarServiceHistoryByJobType(records);
    // cambelt totals £450 (one entry); oil-filter totals £140 (40+40+60).
    expect(groups.map((g) => g.jobType)).toEqual(["cambelt", "oil-filter"]);
  });

  it("returns an empty list for no records", () => {
    expect(groupCarServiceHistoryByJobType([])).toEqual([]);
  });
});

describe("generateCarSupportedAndUnconfirmed", () => {
  const fullyReceipted: JobTypeGroup = { jobType: "oil-filter", label: "Oil & filter change", count: 2, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 2, exactDuplicateCount: 0 };
  const noReceipts: JobTypeGroup = { jobType: "cambelt", label: "Cambelt / timing belt replacement", count: 3, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 0, exactDuplicateCount: 0 };

  it("lists a fully-receipted group as supported", () => {
    const { supported } = generateCarSupportedAndUnconfirmed([fullyReceipted], { implausible: false }, false);
    expect(supported[0]).toContain("Oil & filter change has a receipt trail across 2 entries.");
  });

  it("lists a group with zero receipts as unconfirmed", () => {
    const { unconfirmed } = generateCarSupportedAndUnconfirmed([noReceipts], { implausible: false }, false);
    expect(unconfirmed[0]).toContain("Cambelt / timing belt replacement - no receipts attached");
  });

  // The one line that genuinely differs from the bike version - "car"
  // instead of "bike".
  it("adds a mileage-plausibility unconfirmed item, referring to the car, only when the mileage check itself flagged a problem", () => {
    const clean = generateCarSupportedAndUnconfirmed([], { implausible: false }, false);
    expect(clean.unconfirmed).not.toContain("The car's actual current mileage.");

    const flagged = generateCarSupportedAndUnconfirmed([], { implausible: true, reason: "x" }, false);
    expect(flagged.unconfirmed).toContain("The car's actual current mileage.");
  });

  it("adds a tyre-detail unconfirmed item only when the car has tyre entries logged", () => {
    const withTyres = generateCarSupportedAndUnconfirmed([], { implausible: false }, true);
    expect(withTyres.unconfirmed.some((u) => u.includes("Tyre brand"))).toBe(true);
    const withoutTyres = generateCarSupportedAndUnconfirmed([], { implausible: false }, false);
    expect(withoutTyres.unconfirmed.some((u) => u.includes("Tyre brand"))).toBe(false);
  });

  it("skips a partially-receipted group entirely (neither fully supported nor fully unconfirmed)", () => {
    const partial: JobTypeGroup = { jobType: "x", label: "X", count: 2, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 1, exactDuplicateCount: 0 };
    const { supported, unconfirmed } = generateCarSupportedAndUnconfirmed([partial], { implausible: false }, false);
    expect(supported).toEqual([]);
    expect(unconfirmed).toEqual([]);
  });
});

describe("generateCarDetailedQuestions", () => {
  it("always opens with a current-mileage question, referring to the car", () => {
    expect(generateCarDetailedQuestions([], false, false)[0]).toContain("car's actual current mileage");
  });

  it("asks about the oil change specifically only when an oil-filter group exists", () => {
    const withOil = generateCarDetailedQuestions([{ jobType: "oil-filter" } as JobTypeGroup], false, false);
    expect(withOil.some((q) => q.includes("oil last changed"))).toBe(true);
    const withoutOil = generateCarDetailedQuestions([{ jobType: "cambelt" } as JobTypeGroup], false, false);
    expect(withoutOil.some((q) => q.includes("oil last changed"))).toBe(false);
  });

  // Car-specific addition, no bike equivalent - cambelt/timing chain
  // failure is a well-known catastrophic car-only risk.
  it("asks about the cambelt/timing chain only when neither a cambelt nor timing-chain group exists", () => {
    const withCambelt = generateCarDetailedQuestions([{ jobType: "cambelt" } as JobTypeGroup], false, false);
    expect(withCambelt.some((q) => q.includes("cambelt/timing chain last done"))).toBe(false);
    const withTimingChain = generateCarDetailedQuestions([{ jobType: "timing-chain" } as JobTypeGroup], false, false);
    expect(withTimingChain.some((q) => q.includes("cambelt/timing chain last done"))).toBe(false);
    const withNeither = generateCarDetailedQuestions([{ jobType: "oil-filter" } as JobTypeGroup], false, false);
    expect(withNeither.some((q) => q.includes("cambelt/timing chain last done"))).toBe(true);
  });

  it("asks about fitted tyres only when the car has tyre entries", () => {
    expect(generateCarDetailedQuestions([], false, true).some((q) => q.includes("tyres are currently fitted"))).toBe(true);
    expect(generateCarDetailedQuestions([], false, false).some((q) => q.includes("tyres are currently fitted"))).toBe(false);
  });

  it("asks about paper receipts only when at least one group has zero receipts", () => {
    const withGap = generateCarDetailedQuestions([{ jobType: "x", receiptCount: 0 } as JobTypeGroup], false, false);
    expect(withGap.some((q) => q.includes("paper receipts"))).toBe(true);
    const noGap = generateCarDetailedQuestions([{ jobType: "x", receiptCount: 1, count: 1 } as JobTypeGroup], false, false);
    expect(noGap.some((q) => q.includes("paper receipts"))).toBe(false);
  });

  it("asks about a specific costly outlier only when one genuinely stands out (more than 3x the group's min)", () => {
    const outlierGroup = { jobType: "x", label: "Suspension work", count: 2, minCost: 50, maxCost: 400 } as JobTypeGroup;
    const withOutlier = generateCarDetailedQuestions([outlierGroup], false, false);
    expect(withOutlier.some((q) => q.includes('£400.00 "Suspension work" entry'))).toBe(true);
  });

  it("asks about 'Other'-only entries only when hasOtherEntries is true", () => {
    expect(generateCarDetailedQuestions([], true, false).some((q) => q.includes('logged only as "Other"'))).toBe(true);
    expect(generateCarDetailedQuestions([], false, false).some((q) => q.includes('logged only as "Other"'))).toBe(false);
  });

  it("always ends with the three fixed generic questions, referring to the car", () => {
    const questions = generateCarDetailedQuestions([], false, false);
    expect(questions.slice(-3)).toEqual([
      "Has this car had one owner throughout?",
      "Was any of this work done at an official dealer, or all independent?",
      "Would you consider the asking price against an independent pre-purchase inspection?",
    ]);
  });
});
