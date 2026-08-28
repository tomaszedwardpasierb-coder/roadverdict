import { describe, expect, it } from "vitest";
import { checkMileageConsistency, pointsConflict } from "@/lib/tracker/mileageCheck";

describe("pointsConflict", () => {
  it("detects mileage increasing backwards through time", () => {
    expect(pointsConflict(900, "2025-02-01", 1000, "2025-01-01")).toBe(true);
    expect(pointsConflict(1000, "2025-02-01", 900, "2025-01-01")).toBe(false);
  });

  it("does not treat same-day points as a conflict", () => {
    expect(pointsConflict(1000, "2025-02-01", 900, "2025-02-01")).toBe(false);
  });
});

describe("checkMileageConsistency", () => {
  it("blocks a current or future entry below current mileage", () => {
    const result = checkMileageConsistency(900, "2099-01-01", [], 1000);
    expect(result).toMatchObject({ status: "blocked", reason: "today-lower" });
  });

  it("warns when a historical entry is below an earlier reading", () => {
    const result = checkMileageConsistency(
      900,
      "2025-02-01",
      [{ id: "fuel-1", category: "fuel", mileage: 1000, date: "2025-01-01" }],
      1200
    );
    expect(result).toMatchObject({ status: "warning", reason: "below-earlier", referenceId: "fuel-1" });
  });

  it("can exclude the record currently being edited", () => {
    const result = checkMileageConsistency(
      900,
      "2025-02-01",
      [{ id: "service-1", mileage: 1000, date: "2025-01-01" }],
      1200,
      "service-1"
    );
    expect(result.status).toBe("ok");
  });

  // The remaining scenarios are the ones the planning doc explicitly
  // called for that the four cases above didn't actually exercise.

  it("warns when a historical entry is above a later reading", () => {
    const result = checkMileageConsistency(
      1200,
      "2025-01-01",
      [{ id: "fuel-2", category: "fuel", mileage: 1000, date: "2025-02-01" }],
      1500
    );
    expect(result).toMatchObject({ status: "warning", reason: "above-later", referenceId: "fuel-2" });
  });

  it("does not treat same-day entries as a conflict, regardless of mileage difference", () => {
    const result = checkMileageConsistency(
      500,
      "2025-01-15",
      [{ id: "service-2", mileage: 5000, date: "2025-01-15" }],
      6000
    );
    expect(result.status).toBe("ok");
  });

  it("does not treat equal mileage as a conflict", () => {
    const result = checkMileageConsistency(
      1000,
      "2025-02-01",
      [{ id: "fuel-3", mileage: 1000, date: "2025-01-01" }],
      1200
    );
    expect(result.status).toBe("ok");
  });

  it("picks the closest conflicting record in time when several conflict", () => {
    const result = checkMileageConsistency(
      500,
      "2025-03-01",
      [
        { id: "far", mileage: 1000, date: "2025-01-01" },
        { id: "close", mileage: 800, date: "2025-02-20" },
      ],
      1500
    );
    expect(result).toMatchObject({ status: "warning", referenceId: "close" });
  });

  it("returns ok for a genuinely empty history", () => {
    const result = checkMileageConsistency(500, "2025-01-01", [], 1200);
    expect(result.status).toBe("ok");
  });

  // Not obviously a "mileage" scenario, but a real behaviour of the
  // early-return guard worth having a name attached to: 0 is falsy in
  // JS, so a genuine zero-mileage entry currently skips every check
  // below, same as a missing mileage would. Whether that's the intended
  // behaviour for an actual 0-mile entry is a separate question - this
  // test just makes sure nobody changes it by accident without noticing.
  it("skips all checks for a zero mileage entry, same as a missing one", () => {
    const result = checkMileageConsistency(0, "2025-01-01", [{ id: "x", mileage: 5000, date: "2024-01-01" }], 6000);
    expect(result.status).toBe("ok");
  });
});