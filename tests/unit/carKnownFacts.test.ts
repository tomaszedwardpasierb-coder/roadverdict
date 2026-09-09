import { describe, expect, it } from "vitest";
import { buildCarKnownFacts } from "@/lib/tracker/carKnownFacts";

const baseCar = {
  isCustomBuild: false,
  make: "Ford",
  model: "Focus",
  year: 2018,
  fuelType: "petrol",
  engineLitres: 1.6,
  currentMileage: 40000,
  dvlaData: undefined,
} as any;

describe("buildCarKnownFacts", () => {
  it("sources vehicle identity facts from DVLA for a normal car", () => {
    const facts = buildCarKnownFacts(baseCar, null, 0, 5, 2, null);
    const makeModel = facts.find((f) => f.label === "Make and model");
    expect(makeModel).toEqual({ label: "Make and model", value: "Ford Focus", source: "DVLA" });
  });

  it("sources vehicle identity facts from RoadVerdict for a custom build, and shows 'Custom build' as the year", () => {
    const car = { ...baseCar, isCustomBuild: true };
    const facts = buildCarKnownFacts(car, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Make and model")?.source).toBe("RoadVerdict");
    expect(facts.find((f) => f.label === "Year")).toEqual({ label: "Year", value: "Custom build", source: "RoadVerdict" });
  });

  it("shows 'Not recorded' for a missing year on a non-custom car", () => {
    const car = { ...baseCar, year: undefined };
    const facts = buildCarKnownFacts(car, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Year")?.value).toBe("Not recorded");
  });

  it("describes a petrol/diesel engine in litres", () => {
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, null).find((f) => f.label === "Engine")?.value).toBe("1.6L");
  });

  it("describes a hybrid engine as litres + hybrid", () => {
    const car = { ...baseCar, fuelType: "hybrid", engineLitres: 2.0 };
    expect(buildCarKnownFacts(car, null, 0, 5, 2, null).find((f) => f.label === "Engine")?.value).toBe("2L hybrid");
  });

  it("describes an electric car by its battery size, or plainly 'Electric' if unknown", () => {
    const withBattery = { ...baseCar, fuelType: "electric", engineLitres: undefined, batteryKwh: 64 };
    expect(buildCarKnownFacts(withBattery, null, 0, 5, 2, null).find((f) => f.label === "Engine")?.value).toBe("Electric, 64kWh battery");

    const withoutBattery = { ...baseCar, fuelType: "electric", engineLitres: undefined, batteryKwh: undefined };
    expect(buildCarKnownFacts(withoutBattery, null, 0, 5, 2, null).find((f) => f.label === "Engine")?.value).toBe("Electric");
  });

  it("includes a Registration fact only when one is given", () => {
    expect(buildCarKnownFacts(baseCar, "AB12CDE", 0, 5, 2, null).some((f) => f.label === "Registration")).toBe(true);
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, null).some((f) => f.label === "Registration")).toBe(false);
  });

  it("includes a registration-changes fact only when the count is above zero", () => {
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, null).some((f) => f.label.includes("Registration changes"))).toBe(false);
    const withChange = buildCarKnownFacts(baseCar, null, 2, 5, 2, null).find((f) => f.label.includes("Registration changes"));
    expect(withChange).toEqual({ label: "Registration changes on this account", value: "2", source: "RoadVerdict" });
  });

  it("omits DVLA status and keeper-change facts entirely when there's no DVLA data at all", () => {
    const facts = buildCarKnownFacts(baseCar, null, 0, 5, 2, null);
    expect(facts.some((f) => f.label === "DVLA status")).toBe(false);
    expect(facts.some((f) => f.label === "Keeper changes on record")).toBe(false);
  });

  it("reports no flags plainly when DVLA data exists but nothing is flagged", () => {
    const car = { ...baseCar, dvlaData: { isScrapped: false, isExported: false, isUnscrapped: false, keeperChangeList: [] } };
    const facts = buildCarKnownFacts(car, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "DVLA status")?.value).toBe("No scrapped, exported, or unscrapped flags");
  });

  it("joins multiple DVLA flags together when more than one applies", () => {
    const car = { ...baseCar, dvlaData: { isScrapped: true, isExported: true, isUnscrapped: false, keeperChangeList: [] } };
    const facts = buildCarKnownFacts(car, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "DVLA status")?.value).toBe("Recorded as scrapped, exported");
  });

  it("reports the keeper-change count from DVLA data", () => {
    const car = { ...baseCar, dvlaData: { isScrapped: false, isExported: false, isUnscrapped: false, keeperChangeList: [{}, {}, {}] } };
    const facts = buildCarKnownFacts(car, null, 0, 5, 2, null);
    expect(facts.find((f) => f.label === "Keeper changes on record")?.value).toBe("3");
  });

  it("omits the MOT history fact entirely when there's no MOT history", () => {
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, null).some((f) => f.label === "MOT history")).toBe(false);
    const emptyHistory = { motDueDate: null, tests: [] } as any;
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, emptyHistory).some((f) => f.label === "MOT history")).toBe(false);
  });

  it("reads the most recent MOT test as the last element of the array, not the first", () => {
    const motHistory = {
      motDueDate: "2026-05-01",
      tests: [
        { passed: false },
        { passed: true },
      ],
    } as any;
    const fact = buildCarKnownFacts(baseCar, null, 0, 5, 2, motHistory).find((f) => f.label === "MOT history");
    expect(fact?.value).toContain("2 tests on record, most recent passed");
    expect(fact?.value).toContain("next due 2026-05-01");
  });

  it("reports the logged-history entry and receipt counts, correctly pluralised", () => {
    expect(buildCarKnownFacts(baseCar, null, 0, 1, 0, null).find((f) => f.label === "Logged history")?.value).toBe(
      "1 entry logged (0 with a receipt attached)"
    );
    expect(buildCarKnownFacts(baseCar, null, 0, 5, 2, null).find((f) => f.label === "Logged history")?.value).toBe(
      "5 entries logged (2 with a receipt attached)"
    );
  });
});
