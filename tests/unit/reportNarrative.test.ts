import { describe, expect, it } from "vitest";
import {
  checkCurrentMileagePlausibility,
  groupServiceHistoryByJobType,
  generateStoryParagraphs,
  describeJobTypeGroup,
  generateSupportedAndUnconfirmed,
  generateDetailedQuestions,
  type JobTypeGroup,
} from "@/lib/tracker/reportNarrative";

describe("checkCurrentMileagePlausibility", () => {
  it("is plausible for an ordinary mileage on a bike with a normal annual rate", () => {
    expect(checkCurrentMileagePlausibility(20000, { year: new Date().getFullYear() - 5 })).toEqual({ implausible: false });
  });

  it("flags an absolute mileage above the realistic ceiling regardless of the bike's age", () => {
    const result = checkCurrentMileagePlausibility(300000, {});
    expect(result.implausible).toBe(true);
    expect(result.reason).toContain("not a realistic reading");
  });

  it("flags an implausible annual mileage rate for the bike's age", () => {
    const result = checkCurrentMileagePlausibility(200000, { year: new Date().getFullYear() - 2 });
    expect(result.implausible).toBe(true);
    expect(result.reason).toContain("isn't realistic for ordinary use");
  });

  it("never applies the annual-rate check to a custom build, even at a high implied rate", () => {
    expect(checkCurrentMileagePlausibility(200000, { year: new Date().getFullYear() - 2, isCustomBuild: true })).toEqual({ implausible: false });
  });

  it("never applies the annual-rate check when the bike has no recorded year", () => {
    expect(checkCurrentMileagePlausibility(200000, {})).toEqual({ implausible: false });
  });
});

describe("groupServiceHistoryByJobType", () => {
  const records = [
    { id: "r1", jobType: "oil-filter", date: "2025-01-01", cost: 40, hasReceipt: true },
    { id: "r2", jobType: "oil-filter", date: "2025-01-01", cost: 40, hasReceipt: false }, // exact duplicate of r1
    { id: "r3", jobType: "oil-filter", date: "2025-06-01", cost: 60, hasReceipt: true },
    { id: "r4", jobType: "chain-sprockets", date: "2025-03-01", cost: 150, hasReceipt: false },
  ];

  it("groups records by job type, with each group's own count/dates/cost range/receipt count", () => {
    const groups = groupServiceHistoryByJobType(records);
    const oilGroup = groups.find((g) => g.jobType === "oil-filter")!;
    expect(oilGroup.count).toBe(3);
    expect(oilGroup.minCost).toBe(40);
    expect(oilGroup.maxCost).toBe(60);
    expect(oilGroup.totalCost).toBe(140);
    expect(oilGroup.receiptCount).toBe(2);
    expect(oilGroup.label).toBe("Oil & filter change");
  });

  it("counts entries sharing an identical date and cost within the same group as exact duplicates", () => {
    const groups = groupServiceHistoryByJobType(records);
    const oilGroup = groups.find((g) => g.jobType === "oil-filter")!;
    expect(oilGroup.exactDuplicateCount).toBe(2); // r1 and r2 share date+cost
  });

  it("falls back to the raw job type as the label when it isn't a recognised one", () => {
    const groups = groupServiceHistoryByJobType([{ id: "r1", jobType: "made-up-job", date: "2025-01-01", cost: 10, hasReceipt: false }]);
    expect(groups[0].label).toBe("made-up-job");
  });

  it("sorts groups by total cost, highest first", () => {
    const groups = groupServiceHistoryByJobType(records);
    // chain-sprockets totals £150 (one entry); oil-filter totals £140
    // (40 + 40 + 60) - chain-sprockets is genuinely the higher total.
    expect(groups.map((g) => g.jobType)).toEqual(["chain-sprockets", "oil-filter"]);
  });

  it("returns an empty list for no records", () => {
    expect(groupServiceHistoryByJobType([])).toEqual([]);
  });
});

describe("generateStoryParagraphs", () => {
  const base = { totalEntries: 10, totalSpend: 500, backdatedCount: 0, receiptCount: 5, largestClusterCount: 0, largestClusterDate: null, totalExactDuplicates: 0, otherCount: 0, otherMinCost: 0, otherMaxCost: 0 };

  it("opens with 'logged close to when the work was claimed' when nothing is backdated", () => {
    const paragraphs = generateStoryParagraphs(base);
    expect(paragraphs[0]).toContain("Entries were logged close to when the work was claimed to happen.");
  });

  it("reports the backdated count and percentage when some entries are backdated", () => {
    const paragraphs = generateStoryParagraphs({ ...base, backdatedCount: 5 });
    expect(paragraphs[0]).toContain("5 of those entries - 50% - were added to RoadVerdict after the date they claim to record");
  });

  it("mentions the largest single-day cluster only once it reaches 5 or more entries", () => {
    const small = generateStoryParagraphs({ ...base, backdatedCount: 2, largestClusterCount: 3, largestClusterDate: "2025-01-01" });
    expect(small[0]).not.toContain("largest single concentration");

    const large = generateStoryParagraphs({ ...base, backdatedCount: 6, largestClusterCount: 6, largestClusterDate: "2025-01-01" });
    expect(large[0]).toContain("largest single concentration being 6 entries logged on 1 Jan 2025");
  });

  it("adds an exact-duplicates paragraph only when there are any", () => {
    expect(generateStoryParagraphs(base).some((p) => p.includes("identical date and cost"))).toBe(false);
    expect(generateStoryParagraphs({ ...base, totalExactDuplicates: 2 }).some((p) => p.includes("identical date and cost"))).toBe(true);
  });

  it("always includes the receipt-coverage paragraph with the correct percentage", () => {
    const paragraphs = generateStoryParagraphs(base);
    expect(paragraphs.some((p) => p.includes("5 of 10 entries - 50% - have a receipt"))).toBe(true);
  });

  it("adds an 'Other' category paragraph, with correct singular/plural wording, only when there are any", () => {
    expect(generateStoryParagraphs(base).some((p) => p.includes('"Other"'))).toBe(false);

    const singular = generateStoryParagraphs({ ...base, otherCount: 1, otherMinCost: 20, otherMaxCost: 20 });
    expect(singular.find((p) => p.includes('"Other"'))).toContain("1 entry is logged only as");

    const plural = generateStoryParagraphs({ ...base, otherCount: 3, otherMinCost: 10, otherMaxCost: 50 });
    expect(plural.find((p) => p.includes('"Other"'))).toContain("3 entries are logged only as");
  });
});

describe("describeJobTypeGroup", () => {
  // maxCost (100) must be more than double minCost (40) to actually
  // trigger the cost-range clause below - a narrower £40-£60 spread
  // deliberately would not.
  const group: JobTypeGroup = { jobType: "oil-filter", label: "Oil & filter change", count: 2, dates: ["2025-01-01", "2025-06-01"], minCost: 40, maxCost: 100, totalCost: 140, receiptCount: 2, exactDuplicateCount: 0 };

  it("states the count, formatted dates, receipt coverage, and a wide cost range together", () => {
    const description = describeJobTypeGroup(group);
    expect(description).toContain("2 entries (1 Jan 2025, 1 Jun 2025)");
    expect(description).toContain("all with a receipt attached");
    expect(description).toContain("£40.00 to £100.00");
  });

  it("states 'none with a receipt attached' when receiptCount is 0", () => {
    expect(describeJobTypeGroup({ ...group, receiptCount: 0 })).toContain("none with a receipt attached");
  });

  it("states a partial receipt count when some but not all entries have one", () => {
    expect(describeJobTypeGroup({ ...group, receiptCount: 1 })).toContain("1 of 2 with a receipt attached");
  });

  it("mentions exact duplicates when present", () => {
    expect(describeJobTypeGroup({ ...group, exactDuplicateCount: 1 })).toContain("repeat with an identical date and cost");
  });

  // The cost range is only worth mentioning when it's genuinely wide -
  // more than double between min and max - not for ordinary variation.
  it("omits the cost range entirely when max isn't more than double min", () => {
    const narrow: JobTypeGroup = { ...group, minCost: 40, maxCost: 50 };
    expect(describeJobTypeGroup(narrow)).not.toContain("cost ranging");
  });

  it("uses singular 'entry' for a single-entry group", () => {
    const single: JobTypeGroup = { ...group, count: 1, dates: ["2025-01-01"] };
    expect(describeJobTypeGroup(single)).toContain("1 entry (");
  });
});

describe("generateSupportedAndUnconfirmed", () => {
  const fullyReceipted: JobTypeGroup = { jobType: "oil-filter", label: "Oil & filter change", count: 2, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 2, exactDuplicateCount: 0 };
  const noReceipts: JobTypeGroup = { jobType: "chain-sprockets", label: "Chain & sprockets", count: 3, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 0, exactDuplicateCount: 0 };

  it("lists a fully-receipted group as supported", () => {
    const { supported } = generateSupportedAndUnconfirmed([fullyReceipted], { implausible: false }, false);
    expect(supported[0]).toContain("Oil & filter change has a receipt trail across 2 entries.");
  });

  it("lists a group with zero receipts as unconfirmed", () => {
    const { unconfirmed } = generateSupportedAndUnconfirmed([noReceipts], { implausible: false }, false);
    expect(unconfirmed[0]).toContain("Chain & sprockets - no receipts attached");
  });

  it("adds a mileage-plausibility unconfirmed item only when the mileage check itself flagged a problem", () => {
    const clean = generateSupportedAndUnconfirmed([], { implausible: false }, false);
    expect(clean.unconfirmed).not.toContain("The bike's actual current mileage.");

    const flagged = generateSupportedAndUnconfirmed([], { implausible: true, reason: "x" }, false);
    expect(flagged.unconfirmed).toContain("The bike's actual current mileage.");
  });

  it("adds a tyre-detail unconfirmed item only when the bike has tyre entries logged", () => {
    const withTyres = generateSupportedAndUnconfirmed([], { implausible: false }, true);
    expect(withTyres.unconfirmed.some((u) => u.includes("Tyre brand"))).toBe(true);
    const withoutTyres = generateSupportedAndUnconfirmed([], { implausible: false }, false);
    expect(withoutTyres.unconfirmed.some((u) => u.includes("Tyre brand"))).toBe(false);
  });

  it("skips a partially-receipted group entirely (neither fully supported nor fully unconfirmed)", () => {
    const partial: JobTypeGroup = { jobType: "x", label: "X", count: 2, dates: [], minCost: 0, maxCost: 0, totalCost: 0, receiptCount: 1, exactDuplicateCount: 0 };
    const { supported, unconfirmed } = generateSupportedAndUnconfirmed([partial], { implausible: false }, false);
    expect(supported).toEqual([]);
    expect(unconfirmed).toEqual([]);
  });
});

describe("generateDetailedQuestions", () => {
  it("always opens with a current-mileage question", () => {
    expect(generateDetailedQuestions([], false, false)[0]).toContain("actual current mileage");
  });

  it("asks about the oil change specifically only when an oil-filter group exists", () => {
    const withOil = generateDetailedQuestions([{ jobType: "oil-filter" } as JobTypeGroup], false, false);
    expect(withOil.some((q) => q.includes("oil last changed"))).toBe(true);
    const withoutOil = generateDetailedQuestions([{ jobType: "chain-sprockets" } as JobTypeGroup], false, false);
    expect(withoutOil.some((q) => q.includes("oil last changed"))).toBe(false);
  });

  it("asks about fitted tyres only when the bike has tyre entries", () => {
    expect(generateDetailedQuestions([], false, true).some((q) => q.includes("tyres are currently fitted"))).toBe(true);
    expect(generateDetailedQuestions([], false, false).some((q) => q.includes("tyres are currently fitted"))).toBe(false);
  });

  it("asks about paper receipts only when at least one group has zero receipts", () => {
    const withGap = generateDetailedQuestions([{ jobType: "x", receiptCount: 0 } as JobTypeGroup], false, false);
    expect(withGap.some((q) => q.includes("paper receipts"))).toBe(true);
    const noGap = generateDetailedQuestions([{ jobType: "x", receiptCount: 1, count: 1 } as JobTypeGroup], false, false);
    expect(noGap.some((q) => q.includes("paper receipts"))).toBe(false);
  });

  it("asks about a specific costly outlier only when one genuinely stands out (more than 3x the group's min)", () => {
    const outlierGroup = { jobType: "x", label: "Suspension work", count: 2, minCost: 50, maxCost: 400 } as JobTypeGroup;
    const withOutlier = generateDetailedQuestions([outlierGroup], false, false);
    expect(withOutlier.some((q) => q.includes('£400.00 "Suspension work" entry'))).toBe(true);

    const noOutlierGroup = { jobType: "x", label: "Suspension work", count: 2, minCost: 100, maxCost: 200 } as JobTypeGroup;
    const withoutOutlier = generateDetailedQuestions([noOutlierGroup], false, false);
    expect(withoutOutlier.some((q) => q.includes("entry actually include"))).toBe(false);
  });

  it("asks about 'Other'-only entries only when hasOtherEntries is true", () => {
    expect(generateDetailedQuestions([], true, false).some((q) => q.includes('logged only as "Other"'))).toBe(true);
    expect(generateDetailedQuestions([], false, false).some((q) => q.includes('logged only as "Other"'))).toBe(false);
  });

  it("always ends with the three fixed generic questions", () => {
    const questions = generateDetailedQuestions([], false, false);
    expect(questions.slice(-3)).toEqual([
      "Has this bike had one owner throughout?",
      "Was any of this work done at an official dealer, or all independent?",
      "Would you consider the asking price against an independent pre-purchase inspection?",
    ]);
  });
});