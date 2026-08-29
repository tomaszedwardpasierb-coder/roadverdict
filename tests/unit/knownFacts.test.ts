import { describe, expect, it } from "vitest";
import { buildKnownFacts } from "@/lib/tracker/knownFacts";

const baseBike = {
  isCustomBuild: false,
  make: "Yamaha",
  model: "MT-07",
  year: 2018,
  engineCC: 689,
  currentMileage: 15000,
  dvlaData: undefined,
} as any;

describe("buildKnownFacts", () => {
  it("sources vehicle identity facts from DVLA for a normal bike", () => {
    const facts = buildKnownFacts(baseBike, null, 0, 5, 2, null);
    const makeModel = facts.find((f) => f.label === "Make and model");
    expect(makeModel).toEqual({ label: "Make and model", value: "Yamaha MT-07", source: "DVLA" });
  });

  it("sources vehicle identity facts from RoadVerdict for a custom build, and shows 'Custom build' as the year", () => {
    const bike = { ...baseBike, isCustomBuild: true };
    const facts = buildKnownFacts(bike, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Make and model")?.source).toBe("RoadVerdict");
    expect(facts.find((f) => f.label === "Year")).toEqual({ label: "Year", value: "Custom build", source: "RoadVerdict" });
  });

  it("shows 'Not recorded' for a missing year on a non-custom bike", () => {
    const bike = { ...baseBike, year: undefined };
    const facts = buildKnownFacts(bike, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Year")?.value).toBe("Not recorded");
  });

  it("includes a Registration fact only when one is given", () => {
    expect(buildKnownFacts(baseBike, "AB12CDE", 0, 5, 2, null).some((f) => f.label === "Registration")).toBe(true);
    expect(buildKnownFacts(baseBike, null, 0, 5, 2, null).some((f) => f.label === "Registration")).toBe(false);
  });

  it("includes a registration-changes fact only when the count is above zero", () => {
    expect(buildKnownFacts(baseBike, null, 0, 5, 2, null).some((f) => f.label.includes("Registration changes"))).toBe(false);
    const withChange = buildKnownFacts(baseBike, null, 2, 5, 2, null).find((f) => f.label.includes("Registration changes"));
    expect(withChange).toEqual({ label: "Registration changes on this account", value: "2", source: "RoadVerdict" });
  });

  it("omits DVLA status and keeper-change facts entirely when there's no DVLA data at all", () => {
    const facts = buildKnownFacts(baseBike, null, 0, 5, 2, null);
    expect(facts.some((f) => f.label === "DVLA status")).toBe(false);
    expect(facts.some((f) => f.label === "Keeper changes on record")).toBe(false);
  });

  it("reports no flags plainly when DVLA data exists but nothing is flagged", () => {
    const bike = { ...baseBike, dvlaData: { isScrapped: false, isExported: false, isUnscrapped: false, keeperChangeList: [] } };
    const facts = buildKnownFacts(bike, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "DVLA status")?.value).toBe("No scrapped, exported, or unscrapped flags");
  });

  it("joins multiple DVLA flags together when more than one applies", () => {
    const bike = { ...baseBike, dvlaData: { isScrapped: true, isExported: true, isUnscrapped: false, keeperChangeList: [] } };
    const facts = buildKnownFacts(bike, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "DVLA status")?.value).toBe("Recorded as scrapped, exported");
  });

  it("reports the keeper-change count from DVLA data", () => {
    const bike = { ...baseBike, dvlaData: { isScrapped: false, isExported: false, isUnscrapped: false, keeperChangeList: [{}, {}, {}] } };
    const facts = buildKnownFacts(bike, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Keeper changes on record")?.value).toBe("3");
  });

  it("omits the MOT history fact entirely when there's no MOT history", () => {
    expect(buildKnownFacts(baseBike, null, 0, 5, 2, null).some((f) => f.label === "MOT history")).toBe(false);
    const emptyHistory = { motDueDate: null, tests: [] } as any;
    expect(buildKnownFacts(baseBike, null, 0, 5, 2, emptyHistory).some((f) => f.label === "MOT history")).toBe(false);
  });

  // Tests are stored oldest-first, so the LAST element is the most
  // recent one - worth confirming this reads the right end of the array.
  it("reads the most recent MOT test as the last element of the array, not the first", () => {
    const motHistory = {
      motDueDate: "2026-05-01",
      tests: [
        { passed: false }, // oldest, failed
        { passed: true }, // most recent, passed
      ],
    } as any;
    const fact = buildKnownFacts(baseBike, null, 0, 5, 2, motHistory).find((f) => f.label === "MOT history");
    expect(fact?.value).toContain("2 tests on record, most recent passed");
    expect(fact?.value).toContain("next due 2026-05-01");
  });

  it("singularises the MOT test count for exactly one test", () => {
    const motHistory = { motDueDate: null, tests: [{ passed: true }] } as any;
    const fact = buildKnownFacts(baseBike, null, 0, 5, 2, motHistory).find((f) => f.label === "MOT history");
    expect(fact?.value).toContain("1 test on record");
    expect(fact?.value).not.toContain("next due");
  });

  it("reports the logged-history entry and receipt counts, correctly pluralised", () => {
    expect(buildKnownFacts(baseBike, null, 0, 1, 0, null).find((f) => f.label === "Logged history")?.value).toBe(
      "1 entry logged (0 with a receipt attached)"
    );
    expect(buildKnownFacts(baseBike, null, 0, 5, 2, null).find((f) => f.label === "Logged history")?.value).toBe(
      "5 entries logged (2 with a receipt attached)"
    );
  });
});