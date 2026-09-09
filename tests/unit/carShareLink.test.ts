// Mirrors shareLink.test.ts - the follow-up mechanism
// (getShareLinksNeedingFollowUp/markShareLinkFollowUpSent) isn't
// mirrored here at all, since carShareLink.ts deliberately doesn't
// implement it yet (see that file's own comment: it depends on car
// ownership transfer, which isn't built).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  fetchAll: vi.fn(),
  deleteCarReceiptRequestsForShareToken: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    query: vi.fn((queryObj: unknown, options: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj, options) })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("@/lib/tracker/carReceiptRequest", () => ({ deleteCarReceiptRequestsForShareToken: mocks.deleteCarReceiptRequestsForShareToken }));

import {
  createCarShareLink,
  resolveCarShareToken,
  getCarShareLinksForUser,
  getCarShareLink,
  extendCarShareLink,
  updateCarShareLinkAskingPrice,
  deleteCarShareLink,
  deleteExpiredCarShareLinks,
  type CarShareLinkDoc,
} from "@/lib/tracker/carShareLink";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mockContainer.items.query.mockClear();
}

function makeLink(overrides: Partial<CarShareLinkDoc> = {}): CarShareLinkDoc {
  return {
    id: "tok_abc123",
    pk: "tok_abc123",
    type: "carShareLink",
    email: "owner@example.com",
    carId: "car-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    recipientEmail: "buyer@example.com",
    ...overrides,
  };
}

function addCalendarDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

describe("createCarShareLink", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("creates a doc whose id and pk are both the generated token", async () => {
    const link = await createCarShareLink("owner@example.com", "car-1", "1week", "Buyer@Example.com");
    expect(link.id).toBe(link.pk);
    expect(typeof link.id).toBe("string");
    expect(link.id.length).toBeGreaterThan(10);
    expect(mocks.upsert).toHaveBeenCalledWith(link);
  });

  it.each([
    ["1week", 7],
    ["1month", 30],
    ["6months", 182],
  ])("sets expiresAt %s days out for a %s duration", async (duration, days) => {
    const before = new Date();
    const link = await createCarShareLink("owner@example.com", "car-1", duration as any, "buyer@example.com");
    const expected = addCalendarDays(before, days);
    expect(new Date(link.expiresAt!).getTime()).toBeGreaterThan(expected.getTime() - 5000);
    expect(new Date(link.expiresAt!).getTime()).toBeLessThan(expected.getTime() + 5000);
  });

  it("trims and lowercases the recipient email", async () => {
    const link = await createCarShareLink("owner@example.com", "car-1", "1week", "  Buyer@Example.COM  ");
    expect(link.recipientEmail).toBe("buyer@example.com");
  });

  it("passes an explicit asking price through, and omits it entirely when not given", async () => {
    const withPrice = await createCarShareLink("owner@example.com", "car-1", "1week", "buyer@example.com", 5000);
    expect(withPrice.askingPrice).toBe(5000);

    const withoutPrice = await createCarShareLink("owner@example.com", "car-1", "1week", "buyer@example.com");
    expect(withoutPrice.askingPrice).toBeUndefined();
  });
});

describe("resolveCarShareToken", () => {
  beforeEach(resetAllMocks);

  it("returns null when no document exists at that token", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await resolveCarShareToken("missing")).toBeNull();
  });

  it("resolves a valid, unexpired link to its email/carId/recipient/askingPrice", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: 4500 }) });
    expect(await resolveCarShareToken("tok_abc123")).toEqual({
      email: "owner@example.com", carId: "car-1", recipientEmail: "buyer@example.com", askingPrice: 4500,
    });
  });

  it("treats an expired link as if it doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: "2000-01-01T00:00:00.000Z" }) });
    expect(await resolveCarShareToken("tok_abc123")).toBeNull();
  });

  it("never expires a legacy link that has no expiresAt at all", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: undefined }) });
    expect(await resolveCarShareToken("tok_abc123")).not.toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await resolveCarShareToken("tok_abc123")).toBeNull();
  });
});

describe("getCarShareLinksForUser", () => {
  beforeEach(resetAllMocks);

  it("queries by email, newest first, and returns the resources", async () => {
    const links = [makeLink({ id: "a", pk: "a" }), makeLink({ id: "b", pk: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: links });

    const result = await getCarShareLinksForUser("owner@example.com");

    expect(result).toEqual(links);
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("ORDER BY c.createdAt DESC");
    expect(query.parameters).toEqual([{ name: "@email", value: "owner@example.com" }]);
  });

  it("returns an empty list when the user has no links", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getCarShareLinksForUser("owner@example.com")).toEqual([]);
  });
});

describe("getCarShareLink", () => {
  beforeEach(resetAllMocks);

  it("returns the link when it exists", async () => {
    const link = makeLink();
    mocks.read.mockResolvedValue({ resource: link });
    expect(await getCarShareLink("tok_abc123")).toEqual(link);
  });

  it("returns null when it doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getCarShareLink("missing")).toBeNull();
  });
});

describe("extendCarShareLink", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the link doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await extendCarShareLink("missing", "1week")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("pushes expiresAt out by the new duration from today, replacing the old value", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: "2020-01-01T00:00:00.000Z" }) });
    const before = new Date();
    const result = await extendCarShareLink("tok_abc123", "1month");
    const expected = addCalendarDays(before, 30);
    expect(new Date(result!.expiresAt!).getTime()).toBeGreaterThan(expected.getTime() - 5000);
    expect(mocks.upsert).toHaveBeenCalledWith(result);
  });
});

describe("updateCarShareLinkAskingPrice", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the link doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateCarShareLinkAskingPrice("missing", 5000)).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets a new asking price", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: undefined }) });
    const result = await updateCarShareLinkAskingPrice("tok_abc123", 6000);
    expect(result?.askingPrice).toBe(6000);
  });

  it("genuinely removes the askingPrice key (not just sets it falsy) when passed null", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: 6000 }) });
    const result = await updateCarShareLinkAskingPrice("tok_abc123", null);
    expect("askingPrice" in (result as object)).toBe(false);
  });
});

describe("deleteCarShareLink", () => {
  beforeEach(resetAllMocks);

  it("cascades to the link's receipt requests, then deletes the link itself", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ email: "owner@example.com" }) });

    await deleteCarShareLink("tok_abc123");

    expect(mocks.deleteCarReceiptRequestsForShareToken).toHaveBeenCalledWith("owner@example.com", "tok_abc123");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
    expect(mockContainer.item).toHaveBeenCalledWith("tok_abc123", "tok_abc123");
  });

  it("still deletes the (already-gone) link document even when no resource was found, skipping the cascade", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });

    await deleteCarShareLink("tok_abc123");

    expect(mocks.deleteCarReceiptRequestsForShareToken).not.toHaveBeenCalled();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });
});

describe("deleteExpiredCarShareLinks", () => {
  beforeEach(resetAllMocks);

  it("cascades and deletes every expired link found, returning the count", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { id: "tok_a", email: "a@example.com" },
        { id: "tok_b", email: "b@example.com" },
      ],
    });

    const count = await deleteExpiredCarShareLinks();

    expect(count).toBe(2);
    expect(mocks.deleteCarReceiptRequestsForShareToken).toHaveBeenCalledWith("a@example.com", "tok_a");
    expect(mocks.deleteCarReceiptRequestsForShareToken).toHaveBeenCalledWith("b@example.com", "tok_b");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
  });

  it("returns 0 and deletes nothing when no links are expired", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await deleteExpiredCarShareLinks()).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("queries only for links whose expiresAt is genuinely defined and in the past", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await deleteExpiredCarShareLinks();
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("IS_DEFINED(c.expiresAt)");
    expect(query.query).toContain("c.expiresAt < @now");
  });
});
