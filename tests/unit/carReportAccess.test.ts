// Only allKnownCarPlates/verifyCarPlate are mirrored here -
// hasReportAccess/grantReportAccess/checkPlateRateLimit/
// recordPlateAttempt/normalizePlate are reused directly from
// reportAccess.ts (already vehicle-neutral), so their coverage lives in
// tests/unit/reportAccess.test.ts, not duplicated here.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveCarShareToken: vi.fn(),
  getCarById: vi.fn(),
}));

vi.mock("@/lib/tracker/carShareLink", () => ({ resolveCarShareToken: mocks.resolveCarShareToken }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));

import { allKnownCarPlates, verifyCarPlate } from "@/lib/tracker/carReportAccess";

describe("allKnownCarPlates", () => {
  it("includes the original registration only when there's no history of changes", () => {
    expect(allKnownCarPlates({ originalRegistration: "AB12 CDE" } as any)).toEqual(["AB12CDE"]);
  });

  it("includes every plate the car has ever held, not just the current one", () => {
    const plates = allKnownCarPlates({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ" }, { plate: "MN01 ABC" }],
    } as any);
    expect(plates).toEqual(expect.arrayContaining(["AB12CDE", "XY99ZZZ", "MN01ABC"]));
    expect(plates).toHaveLength(3);
  });

  it("de-duplicates when the same plate appears as both original and a logged change", () => {
    const plates = allKnownCarPlates({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "AB12 CDE" }],
    } as any);
    expect(plates).toEqual(["AB12CDE"]);
  });

  it("returns an empty list for a car with no registration on record at all", () => {
    expect(allKnownCarPlates({} as any)).toEqual([]);
  });
});

describe("verifyCarPlate", () => {
  beforeEach(() => {
    mocks.resolveCarShareToken.mockReset();
    mocks.getCarById.mockReset();
  });

  it("rejects an invalid or expired share token before checking any plate", async () => {
    mocks.resolveCarShareToken.mockResolvedValue(null);

    const result = await verifyCarPlate("bad-token", "AB12CDE");

    expect(result).toBe(false);
    expect(mocks.getCarById).not.toHaveBeenCalled();
  });

  it("accepts the car's current plate", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarById.mockResolvedValue({ originalRegistration: "AB12 CDE" });

    expect(await verifyCarPlate("token", "ab12cde")).toBe(true);
  });

  it("accepts an older plate the car used to hold, not just the current one", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarById.mockResolvedValue({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ" }],
    });

    expect(await verifyCarPlate("token", "XY99 ZZZ")).toBe(true);
  });

  it("rejects a plate the car has never held", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarById.mockResolvedValue({ originalRegistration: "AB12 CDE" });

    expect(await verifyCarPlate("token", "ZZ99 ZZZ")).toBe(false);
  });

  it("rejects everything for a car with no registration on record", async () => {
    mocks.resolveCarShareToken.mockResolvedValue({ email: "owner@example.com", carId: "car-1" });
    mocks.getCarById.mockResolvedValue({});

    expect(await verifyCarPlate("token", "AB12CDE")).toBe(false);
  });
});
