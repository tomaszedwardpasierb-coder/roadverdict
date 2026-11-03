// The MOT mileage floor: a vehicle's mileage can't be below its latest
// DVSA-confirmed MOT reading.
import { describe, expect, it } from "vitest";
import { latestMotReading, raiseMileageToMotReading } from "@/lib/tracker/motMileageFloor";

const test = (testDate: string, mileage: number | null) => ({ testDate, mileage, passed: true, mileageTrusted: mileage !== null, notes: "" });

describe("latestMotReading", () => {
  it("takes the newest test with a confirmed reading", () => {
    expect(latestMotReading([test("2023-05-01T10:00:00Z", 30000), test("2024-05-02T10:00:00Z", 43851), test("2025-05-03T10:00:00Z", null)])).toEqual({
      miles: 43851,
      date: "2024-05-02",
    });
    expect(latestMotReading([test("2024-05-02T10:00:00Z", null)])).toBeNull();
    expect(latestMotReading([])).toBeNull();
  });
});

describe("raiseMileageToMotReading", () => {
  const reading = { miles: 43851, date: "2026-03-10" };

  it("lifts a typed-in mileage below the MOT's - current and starting, when that MOT came before the vehicle was added", () => {
    const car = { currentMileage: 2, startingMileage: 2, dateAdded: "2026-11-03" };
    expect(raiseMileageToMotReading(car, reading)).toBe(true);
    expect(car).toEqual({ currentMileage: 43851, startingMileage: 43851, dateAdded: "2026-11-03" });
  });

  it("leaves the starting mileage alone for an MOT after the vehicle was added", () => {
    const bike = { currentMileage: 40000, startingMileage: 38000, dateAdded: "2025-12-01" };
    expect(raiseMileageToMotReading(bike, reading)).toBe(true);
    expect(bike).toEqual({ currentMileage: 43851, startingMileage: 38000, dateAdded: "2025-12-01" });
  });

  it("changes nothing when the mileage is already at or above the reading", () => {
    const car = { currentMileage: 45000, startingMileage: 43851, dateAdded: "2026-11-03" };
    expect(raiseMileageToMotReading(car, reading)).toBe(false);
    expect(car.currentMileage).toBe(45000);
  });
});
