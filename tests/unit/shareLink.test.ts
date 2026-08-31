import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  fetchAll: vi.fn(),
  deleteReceiptRequestsForShareToken: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    query: vi.fn((queryObj: unknown, options: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj, options) })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
vi.mock("@/lib/tracker/receiptRequest", () => ({ deleteReceiptRequestsForShareToken: mocks.deleteReceiptRequestsForShareToken }));

import {
  createShareLink,
  resolveShareToken,
  getShareLinksForUser,
  getShareLink,
  extendShareLink,
  updateShareLinkAskingPrice,
  deleteShareLink,
  deleteExpiredShareLinks,
  getShareLinksNeedingFollowUp,
  markShareLinkFollowUpSent,
  type ShareLinkDoc,
} from "@/lib/tracker/shareLink";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockClear();
  mockContainer.items.query.mockClear();
}

function makeLink(overrides: Partial<ShareLinkDoc> = {}): ShareLinkDoc {
  return {
    id: "tok_abc123",
    pk: "tok_abc123",
    type: "shareLink",
    email: "owner@example.com",
    bikeId: "bike-1",
    createdAt: "2025-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
    recipientEmail: "buyer@example.com",
    ...overrides,
  };
}

// Mirrors computeExpiresAt's own calendar-day arithmetic (setDate),
// rather than naive days*86400000 millisecond math - those two
// diverge by up to an hour whenever the span crosses a daylight-saving
// transition, so this is required for correctness, not just style.
function addCalendarDays(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d;
}

// ---------------------------------------------------------------------
// createShareLink
// ---------------------------------------------------------------------

describe("createShareLink", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("creates a doc whose id and pk are both the generated token", async () => {
    const link = await createShareLink("owner@example.com", "bike-1", "1week", "Buyer@Example.com");
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
    const link = await createShareLink("owner@example.com", "bike-1", duration as any, "buyer@example.com");
    const expected = addCalendarDays(before, days);
    // Allow a little slack for real elapsed test-execution time.
    expect(new Date(link.expiresAt!).getTime()).toBeGreaterThan(expected.getTime() - 5000);
    expect(new Date(link.expiresAt!).getTime()).toBeLessThan(expected.getTime() + 5000);
  });

  it("trims and lowercases the recipient email", async () => {
    const link = await createShareLink("owner@example.com", "bike-1", "1week", "  Buyer@Example.COM  ");
    expect(link.recipientEmail).toBe("buyer@example.com");
  });

  it("passes an explicit asking price through, and omits it entirely when not given", async () => {
    const withPrice = await createShareLink("owner@example.com", "bike-1", "1week", "buyer@example.com", 5000);
    expect(withPrice.askingPrice).toBe(5000);

    const withoutPrice = await createShareLink("owner@example.com", "bike-1", "1week", "buyer@example.com");
    expect(withoutPrice.askingPrice).toBeUndefined();
  });
});

// ---------------------------------------------------------------------
// resolveShareToken
// ---------------------------------------------------------------------

describe("resolveShareToken", () => {
  beforeEach(resetAllMocks);

  it("returns null when no document exists at that token", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await resolveShareToken("missing")).toBeNull();
  });

  it("resolves a valid, unexpired link to its email/bikeId/recipient/askingPrice", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: 4500 }) });
    expect(await resolveShareToken("tok_abc123")).toEqual({
      email: "owner@example.com", bikeId: "bike-1", recipientEmail: "buyer@example.com", askingPrice: 4500,
    });
  });

  it("treats an expired link as if it doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: "2000-01-01T00:00:00.000Z" }) });
    expect(await resolveShareToken("tok_abc123")).toBeNull();
  });

  // Grandfathered guarantee from the source comment: links created
  // before expiry existed have no expiresAt at all and must never be
  // treated as expired.
  it("never expires a legacy link that has no expiresAt at all", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: undefined }) });
    expect(await resolveShareToken("tok_abc123")).not.toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await resolveShareToken("tok_abc123")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// getShareLinksForUser
// ---------------------------------------------------------------------

describe("getShareLinksForUser", () => {
  beforeEach(resetAllMocks);

  it("queries by email, newest first, and returns the resources", async () => {
    const links = [makeLink({ id: "a", pk: "a" }), makeLink({ id: "b", pk: "b" })];
    mocks.fetchAll.mockResolvedValue({ resources: links });

    const result = await getShareLinksForUser("owner@example.com");

    expect(result).toEqual(links);
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("ORDER BY c.createdAt DESC");
    expect(query.parameters).toEqual([{ name: "@email", value: "owner@example.com" }]);
  });

  it("returns an empty list when the user has no links", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getShareLinksForUser("owner@example.com")).toEqual([]);
  });
});

// ---------------------------------------------------------------------
// getShareLink
// ---------------------------------------------------------------------

describe("getShareLink", () => {
  beforeEach(resetAllMocks);

  it("returns the link when it exists", async () => {
    const link = makeLink();
    mocks.read.mockResolvedValue({ resource: link });
    expect(await getShareLink("tok_abc123")).toEqual(link);
  });

  it("returns null when it doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await getShareLink("missing")).toBeNull();
  });

  it("fails soft to null if the read itself throws", async () => {
    mockContainer.item.mockReturnValueOnce({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    });
    expect(await getShareLink("tok_abc123")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// extendShareLink
// ---------------------------------------------------------------------

describe("extendShareLink", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the link doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await extendShareLink("missing", "1week")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("pushes expiresAt out by the new duration from today, replacing the old value", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ expiresAt: "2020-01-01T00:00:00.000Z" }) });
    const before = new Date();
    const result = await extendShareLink("tok_abc123", "1month");
    const expected = addCalendarDays(before, 30);
    expect(new Date(result!.expiresAt!).getTime()).toBeGreaterThan(expected.getTime() - 5000);
    expect(mocks.upsert).toHaveBeenCalledWith(result);
  });
});

// ---------------------------------------------------------------------
// updateShareLinkAskingPrice
// ---------------------------------------------------------------------

describe("updateShareLinkAskingPrice", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the link doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await updateShareLinkAskingPrice("missing", 5000)).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets a new asking price", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: undefined }) });
    const result = await updateShareLinkAskingPrice("tok_abc123", 6000);
    expect(result?.askingPrice).toBe(6000);
  });

  // null clears a previously-set price rather than being a separate
  // "remove" action - and it must genuinely remove the key, not just
  // set it to a falsy value, since the type treats "absent" as the
  // seller's deliberate choice not to share one.
  it("genuinely removes the askingPrice key (not just sets it falsy) when passed null", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ askingPrice: 6000 }) });
    const result = await updateShareLinkAskingPrice("tok_abc123", null);
    expect("askingPrice" in (result as object)).toBe(false);
  });
});

// ---------------------------------------------------------------------
// deleteShareLink
// ---------------------------------------------------------------------

describe("deleteShareLink", () => {
  beforeEach(resetAllMocks);

  it("cascades to the link's receipt requests, then deletes the link itself", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ email: "owner@example.com" }) });

    await deleteShareLink("tok_abc123");

    expect(mocks.deleteReceiptRequestsForShareToken).toHaveBeenCalledWith("owner@example.com", "tok_abc123");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
    expect(mockContainer.item).toHaveBeenCalledWith("tok_abc123", "tok_abc123");
  });

  it("still deletes the (already-gone) link document even when no resource was found, skipping the cascade", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });

    await deleteShareLink("tok_abc123");

    expect(mocks.deleteReceiptRequestsForShareToken).not.toHaveBeenCalled();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// deleteExpiredShareLinks
// ---------------------------------------------------------------------

describe("deleteExpiredShareLinks", () => {
  beforeEach(resetAllMocks);

  it("cascades and deletes every expired link found, returning the count", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { id: "tok_a", email: "a@example.com" },
        { id: "tok_b", email: "b@example.com" },
      ],
    });

    const count = await deleteExpiredShareLinks();

    expect(count).toBe(2);
    expect(mocks.deleteReceiptRequestsForShareToken).toHaveBeenCalledWith("a@example.com", "tok_a");
    expect(mocks.deleteReceiptRequestsForShareToken).toHaveBeenCalledWith("b@example.com", "tok_b");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
  });

  it("returns 0 and deletes nothing when no links are expired", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await deleteExpiredShareLinks()).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });

  it("queries only for links whose expiresAt is genuinely defined and in the past", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await deleteExpiredShareLinks();
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("IS_DEFINED(c.expiresAt)");
    expect(query.query).toContain("c.expiresAt < @now");
  });
});

// ---------------------------------------------------------------------
// getShareLinksNeedingFollowUp
// ---------------------------------------------------------------------

describe("getShareLinksNeedingFollowUp", () => {
  beforeEach(resetAllMocks);

  it("returns links that need a follow-up", async () => {
    const links = [makeLink()];
    mocks.fetchAll.mockResolvedValue({ resources: links });
    expect(await getShareLinksNeedingFollowUp()).toEqual(links);
  });

  it("filters for links with a recipient and no follow-up sent yet, created at least 28 days ago", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    const before = new Date();

    await getShareLinksNeedingFollowUp();

    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("IS_DEFINED(c.recipientEmail)");
    expect(query.query).toContain("NOT IS_DEFINED(c.followUpSentAt)");
    const cutoffParam = query.parameters.find((p: any) => p.name === "@cutoff").value;
    const expectedCutoff = addCalendarDays(before, -28);
    expect(new Date(cutoffParam).getTime()).toBeGreaterThan(expectedCutoff.getTime() - 5000);
    expect(new Date(cutoffParam).getTime()).toBeLessThan(expectedCutoff.getTime() + 5000);
  });
});

// ---------------------------------------------------------------------
// markShareLinkFollowUpSent
// ---------------------------------------------------------------------

describe("markShareLinkFollowUpSent", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("silently does nothing when the link doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(markShareLinkFollowUpSent("missing")).resolves.toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets followUpSentAt and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeLink({ followUpSentAt: undefined }) });
    await markShareLinkFollowUpSent("tok_abc123");
    const [upserted] = mocks.upsert.mock.calls[0];
    expect(typeof upserted.followUpSentAt).toBe("string");
  });
});