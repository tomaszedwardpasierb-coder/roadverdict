import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  itemsCreate: vi.fn(),
  fetchAll: vi.fn(),
  cookieGet: vi.fn(),
  resolveShareToken: vi.fn(),
  getBike: vi.fn(),
}));

const mockContainer = {
  item: vi.fn(() => ({ read: mocks.read })),
  items: {
    create: mocks.itemsCreate,
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: mocks.cookieGet })) }));
vi.mock("@/lib/tracker/shareLink", () => ({ resolveShareToken: mocks.resolveShareToken }));
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
// hashToken and generateToken are deliberately NOT mocked - hashToken is a
// pure, deterministic SHA-256 wrapper (safe and simpler to use for real
// than to fake), and none of the functions under test here call
// generateToken at all.

import {
  normalizePlate,
  allKnownPlates,
  hasReportAccess,
  checkPlateRateLimit,
  verifyPlate,
} from "@/lib/tracker/reportAccess";

describe("normalizePlate", () => {
  it("uppercases and strips whitespace", () => {
    expect(normalizePlate("ab12 cde")).toBe("AB12CDE");
    expect(normalizePlate("  AB12   CDE  ")).toBe("AB12CDE");
    expect(normalizePlate("AB12CDE")).toBe("AB12CDE");
  });
});

describe("allKnownPlates", () => {
  it("includes the original registration only when there's no history of changes", () => {
    expect(allKnownPlates({ originalRegistration: "AB12 CDE" } as any)).toEqual(["AB12CDE"]);
  });

  it("includes every plate the bike has ever held, not just the current one", () => {
    const plates = allKnownPlates({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ" }, { plate: "MN01 ABC" }],
    } as any);
    expect(plates).toEqual(expect.arrayContaining(["AB12CDE", "XY99ZZZ", "MN01ABC"]));
    expect(plates).toHaveLength(3);
  });

  it("de-duplicates when the same plate appears as both original and a logged change", () => {
    const plates = allKnownPlates({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "AB12 CDE" }],
    } as any);
    expect(plates).toEqual(["AB12CDE"]);
  });

  it("returns an empty list for a bike with no registration on record at all", () => {
    expect(allKnownPlates({} as any)).toEqual([]);
  });
});

describe("verifyPlate", () => {
  beforeEach(() => {
    mocks.resolveShareToken.mockReset();
    mocks.getBike.mockReset();
  });

  it("rejects an invalid or expired share token before checking any plate", async () => {
    mocks.resolveShareToken.mockResolvedValue(null);

    const result = await verifyPlate("bad-token", "AB12CDE");

    expect(result).toBe(false);
    expect(mocks.getBike).not.toHaveBeenCalled();
  });

  it("accepts the bike's current plate", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({ originalRegistration: "AB12 CDE" });

    expect(await verifyPlate("token", "ab12cde")).toBe(true);
  });

  it("accepts an older plate the bike used to hold, not just the current one", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({
      originalRegistration: "AB12 CDE",
      registrationChanges: [{ plate: "XY99 ZZZ" }],
    });

    expect(await verifyPlate("token", "XY99 ZZZ")).toBe(true);
  });

  it("rejects a plate the bike has never held", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({ originalRegistration: "AB12 CDE" });

    expect(await verifyPlate("token", "ZZ99 ZZZ")).toBe(false);
  });

  // Explicit case called out in the source comment: a bike with no
  // registration on record at all must not be gateable by any plate,
  // since there's nothing genuine to check the guess against.
  it("rejects everything for a bike with no registration on record", async () => {
    mocks.resolveShareToken.mockResolvedValue({ email: "owner@example.com", bikeId: "bike-1" });
    mocks.getBike.mockResolvedValue({});

    expect(await verifyPlate("token", "AB12CDE")).toBe(false);
  });
});

describe("hasReportAccess", () => {
  beforeEach(() => {
    mocks.cookieGet.mockReset();
    mocks.read.mockReset();
  });

  it("denies access when no session cookie is present", async () => {
    mocks.cookieGet.mockReturnValue(undefined);

    expect(await hasReportAccess("token")).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("denies access when the cookie doesn't match any stored session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "some-raw-value" });
    mocks.read.mockResolvedValue({ resource: undefined });

    expect(await hasReportAccess("token")).toBe(false);
  });

  // Defensive check in the source, worth locking in specifically: even a
  // real Cosmos item at that id/partition must be the RIGHT kind of
  // document, not just present, before it counts as a valid session.
  it("denies access when the stored document isn't actually a report access session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "some-raw-value" });
    mocks.read.mockResolvedValue({ resource: { type: "somethingElse", expiresAt: "2099-01-01" } });

    expect(await hasReportAccess("token")).toBe(false);
  });

  it("denies access when the session has expired", async () => {
    mocks.cookieGet.mockReturnValue({ value: "some-raw-value" });
    mocks.read.mockResolvedValue({
      resource: { type: "reportAccessSession", expiresAt: "2020-01-01T00:00:00.000Z" },
    });

    expect(await hasReportAccess("token")).toBe(false);
  });

  it("grants access for a valid, unexpired session", async () => {
    mocks.cookieGet.mockReturnValue({ value: "some-raw-value" });
    mocks.read.mockResolvedValue({
      resource: { type: "reportAccessSession", expiresAt: "2099-01-01T00:00:00.000Z" },
    });

    expect(await hasReportAccess("token")).toBe(true);
  });
});

describe("checkPlateRateLimit", () => {
  beforeEach(() => {
    mocks.fetchAll.mockReset();
  });

  it("allows the attempt when under the limit", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: Array.from({ length: 3 }, (_, i) => ({ id: `a${i}` })) });

    expect(await checkPlateRateLimit("token")).toEqual({ allowed: true });
  });

  // The exact threshold, and the race condition documented in the
  // source this replaced - a plain count of independent attempt records
  // rather than a shared read-modify-write counter.
  it("blocks once the limit is reached", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}` })) });

    expect(await checkPlateRateLimit("token")).toEqual({ allowed: false });
  });
});