import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
  fetchAll: vi.fn(),
}));

const mockContainer = {
  item: vi.fn((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn })),
  items: {
    upsert: mocks.upsert,
    query: vi.fn((queryObj: unknown, options: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj, options) })),
  },
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));
// @/lib/auth/crypto (generateToken, hashToken) is deliberately NOT
// mocked - it's pure, real SHA-256/randomBytes, so tests can verify the
// genuine hash-matches-token relationship rather than a stand-in for it.

import { hashToken } from "@/lib/auth/crypto";
import {
  createReceiptRequest,
  getReceiptRequestsForShareToken,
  deleteReceiptRequestsForShareToken,
  purgeOrphanedReceiptRequests,
  getPendingReceiptRequestsForOwner,
  getReceiptRequestByDecisionToken,
  decideReceiptRequestItems,
  canSendReminder,
  recordReminderSent,
  regenerateDecisionToken,
  DEFAULT_DECLINE_REASON,
  type ReceiptRequestDoc,
} from "@/lib/tracker/receiptRequest";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  // A couple of tests below override container.item's implementation
  // (mockImplementation, not -Once) to give different behaviour per id
  // within a single test. mockReset + reassigning the default here
  // ensures that override never leaks into the next test.
  mockContainer.item.mockReset();
  mockContainer.item.mockImplementation((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn }));
  mockContainer.items.query.mockClear();
}

function makeRequest(overrides: Partial<ReceiptRequestDoc> = {}): ReceiptRequestDoc {
  return {
    id: "owner@example.com::receiptRequest::1000",
    pk: "owner@example.com",
    type: "receiptRequest",
    shareToken: "tok_abc123",
    bikeId: "bike-1",
    buyerEmail: "buyer@example.com",
    items: [{ entryId: "sr-1", category: "service", description: "Oil change", status: "pending" }],
    decisionTokenHash: "somehash",
    createdAt: "2025-01-01T00:00:00.000Z",
    ttl: 7776000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// createReceiptRequest
// ---------------------------------------------------------------------

describe("createReceiptRequest", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("stores every item as pending, regardless of what status the caller passed in", async () => {
    const { doc } = await createReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", bikeId: "bike-1",
      items: [{ entryId: "sr-1", category: "service", description: "Oil change" }],
    });
    expect(doc.items[0].status).toBe("pending");
  });

  // The decision link's real security property: only the hash is ever
  // persisted, and the returned raw token must genuinely hash to it.
  it("returns a raw decision token whose hash is exactly what got stored", async () => {
    const { doc, decisionToken } = await createReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", bikeId: "bike-1", items: [],
    });
    expect(doc.decisionTokenHash).toBe(hashToken(decisionToken));
  });

  it("scopes the doc's id and partition key to the owner's email", async () => {
    const { doc } = await createReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", bikeId: "bike-1", items: [],
    });
    expect(doc.pk).toBe("owner@example.com");
    expect(doc.id.startsWith("owner@example.com::receiptRequest::")).toBe(true);
  });

  it("sets a 90-day ttl", async () => {
    const { doc } = await createReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", bikeId: "bike-1", items: [],
    });
    expect(doc.ttl).toBe(90 * 24 * 60 * 60);
  });

  it("upserts the exact document it returns", async () => {
    const { doc } = await createReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", bikeId: "bike-1", items: [],
    });
    expect(mocks.upsert).toHaveBeenCalledWith(doc);
  });
});

// ---------------------------------------------------------------------
// getReceiptRequestsForShareToken
// ---------------------------------------------------------------------

describe("getReceiptRequestsForShareToken", () => {
  beforeEach(resetAllMocks);

  it("queries within the owner's own partition, filtered to the given share token", async () => {
    const requests = [makeRequest()];
    mocks.fetchAll.mockResolvedValue({ resources: requests });

    const result = await getReceiptRequestsForShareToken("owner@example.com", "tok_abc123");

    expect(result).toEqual(requests);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@shareToken", value: "tok_abc123" }]);
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });
});

// ---------------------------------------------------------------------
// deleteReceiptRequestsForShareToken
// ---------------------------------------------------------------------

describe("deleteReceiptRequestsForShareToken", () => {
  beforeEach(resetAllMocks);

  it("deletes every request tied to that share token and returns the count", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [makeRequest({ id: "req-1" }), makeRequest({ id: "req-2" })],
    });

    const count = await deleteReceiptRequestsForShareToken("owner@example.com", "tok_abc123");

    expect(count).toBe(2);
    expect(mockContainer.item).toHaveBeenCalledWith("req-1", "owner@example.com");
    expect(mockContainer.item).toHaveBeenCalledWith("req-2", "owner@example.com");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
  });

  it("returns 0 and deletes nothing when there are no requests for that token", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await deleteReceiptRequestsForShareToken("owner@example.com", "tok_abc123")).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// purgeOrphanedReceiptRequests
// ---------------------------------------------------------------------

describe("purgeOrphanedReceiptRequests", () => {
  beforeEach(resetAllMocks);

  it("deletes only requests whose share link no longer exists, leaving live ones alone", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { id: "req-orphan", pk: "owner@example.com", shareToken: "tok_gone" },
        { id: "req-live", pk: "owner@example.com", shareToken: "tok_live" },
      ],
    });
    mockContainer.item.mockImplementation((id?: string) => ({
      read: vi.fn(async () => (id === "tok_live" ? { resource: { id: "tok_live" } } : { resource: undefined })),
      delete: mocks.deleteFn,
    }));

    const count = await purgeOrphanedReceiptRequests();

    expect(count).toBe(1);
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });

  it("treats a link-existence check that throws the same as a genuinely missing link", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "req-1", pk: "owner@example.com", shareToken: "tok_x" }] });
    mockContainer.item.mockImplementation(() => ({
      read: vi.fn(async () => {
        throw new Error("cosmos unavailable");
      }),
      delete: mocks.deleteFn,
    }));

    const count = await purgeOrphanedReceiptRequests();

    expect(count).toBe(1);
  });

  it("is safe to re-run once the backlog is clear - returns 0 with nothing to delete", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await purgeOrphanedReceiptRequests()).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// getPendingReceiptRequestsForOwner
// ---------------------------------------------------------------------

describe("getPendingReceiptRequestsForOwner", () => {
  beforeEach(resetAllMocks);

  it("scopes the query to the owner's own partition", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getPendingReceiptRequestsForOwner("owner@example.com");
    const [, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });

  it("excludes a request where every item has already been decided", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [makeRequest({ id: "req-1", items: [{ entryId: "sr-1", category: "service", description: "x", status: "approved" }] })],
    });
    expect(await getPendingReceiptRequestsForOwner("owner@example.com")).toEqual([]);
  });

  it("includes a request that still has at least one pending item", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [makeRequest({ id: "req-1" })] });
    const result = await getPendingReceiptRequestsForOwner("owner@example.com");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("req-1");
  });

  // Real cross-request guarantee: a decline made on a DIFFERENT request
  // through a different share link is surfaced as prior context here.
  it("surfaces a prior decline of the same entry made through a different request", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        makeRequest({
          id: "req-old", createdAt: "2025-01-01T00:00:00.000Z",
          items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "too personal", decidedAt: "2025-01-02T00:00:00.000Z" }],
        }),
        makeRequest({
          id: "req-new", createdAt: "2025-02-01T00:00:00.000Z",
          items: [{ entryId: "sr-1", category: "service", description: "x", status: "pending" }],
        }),
      ],
    });

    const result = await getPendingReceiptRequestsForOwner("owner@example.com");

    const pendingRequest = result.find((r) => r.id === "req-new")!;
    expect(pendingRequest.items[0].priorDecline).toEqual({ decidedAt: "2025-01-02T00:00:00.000Z", reason: "too personal" });
  });

  it("never treats a request's own item as a 'prior' decline of itself", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        makeRequest({
          id: "req-1",
          items: [
            { entryId: "sr-1", category: "service", description: "x", status: "declined", decidedAt: "2025-01-01T00:00:00.000Z" },
            { entryId: "sr-2", category: "service", description: "y", status: "pending" },
          ],
        }),
      ],
    });
    const result = await getPendingReceiptRequestsForOwner("owner@example.com");
    // sr-2 is a different entry with no genuine prior decline anywhere.
    expect(result[0].items.find((i) => i.entryId === "sr-2")!.priorDecline).toBeUndefined();
  });

  it("picks the most recent decline when the same entry was declined more than once before", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        makeRequest({ id: "req-1", items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", decidedAt: "2025-01-01T00:00:00.000Z", reason: "old reason" }] }),
        makeRequest({ id: "req-2", items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", decidedAt: "2025-03-01T00:00:00.000Z", reason: "newer reason" }] }),
        makeRequest({ id: "req-3", items: [{ entryId: "sr-1", category: "service", description: "x", status: "pending" }] }),
      ],
    });
    const result = await getPendingReceiptRequestsForOwner("owner@example.com");
    const req3 = result.find((r) => r.id === "req-3")!;
    expect(req3.items[0].priorDecline?.reason).toBe("newer reason");
  });
});

// ---------------------------------------------------------------------
// getReceiptRequestByDecisionToken
// ---------------------------------------------------------------------

describe("getReceiptRequestByDecisionToken", () => {
  beforeEach(resetAllMocks);

  it("hashes the raw token and queries by that hash", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getReceiptRequestByDecisionToken("raw-token-value");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@hash", value: hashToken("raw-token-value") }]);
  });

  it("returns the matching request when found", async () => {
    const request = makeRequest();
    mocks.fetchAll.mockResolvedValue({ resources: [request] });
    expect(await getReceiptRequestByDecisionToken("raw-token-value")).toEqual(request);
  });

  it("returns null when no request matches that hash", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getReceiptRequestByDecisionToken("raw-token-value")).toBeNull();
  });
});

// ---------------------------------------------------------------------
// decideReceiptRequestItems
// ---------------------------------------------------------------------

describe("decideReceiptRequestItems", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await decideReceiptRequestItems("req-1", "owner@example.com", "all", "approved")).toBeNull();
  });

  it("declines with a custom reason and sets decidedAt", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest() });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", "all", "declined", "too personal");
    expect(result?.items[0]).toMatchObject({ status: "declined", reason: "too personal" });
    expect(typeof result?.items[0].decidedAt).toBe("string");
  });

  it("falls back to the default decline reason when none (or only whitespace) is given", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest() });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", "all", "declined", "   ");
    expect(result?.items[0].reason).toBe(DEFAULT_DECLINE_REASON);
  });

  it("strips the reason entirely on approval, even if one was previously set", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({ items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "old reason", decidedAt: "2025-01-01T00:00:00.000Z" }] }),
    });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", "all", "approved");
    expect(result?.items[0].status).toBe("approved");
    expect("reason" in result!.items[0]).toBe(false);
  });

  // Explicit guarantee: reverting to pending clears both the reason and
  // the decision timestamp, since neither means anything once it's not
  // actually decided anymore.
  it("clears both reason and decidedAt when reverted back to pending", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({ items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "old reason", decidedAt: "2025-01-01T00:00:00.000Z" }] }),
    });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", "all", "pending");
    expect(result?.items[0].status).toBe("pending");
    expect("reason" in result!.items[0]).toBe(false);
    expect("decidedAt" in result!.items[0]).toBe(false);
  });

  it("only decides the items whose entryId is in the list, leaving the rest untouched", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({
        items: [
          { entryId: "sr-1", category: "service", description: "x", status: "pending" },
          { entryId: "sr-2", category: "service", description: "y", status: "pending" },
        ],
      }),
    });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", ["sr-1"], "approved");
    expect(result?.items.find((i) => i.entryId === "sr-1")?.status).toBe("approved");
    expect(result?.items.find((i) => i.entryId === "sr-2")?.status).toBe("pending");
  });

  it("decides every item when entryIds is 'all'", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({
        items: [
          { entryId: "sr-1", category: "service", description: "x", status: "pending" },
          { entryId: "sr-2", category: "service", description: "y", status: "pending" },
        ],
      }),
    });
    const result = await decideReceiptRequestItems("req-1", "owner@example.com", "all", "approved");
    expect(result?.items.every((i) => i.status === "approved")).toBe(true);
  });
});

// ---------------------------------------------------------------------
// canSendReminder
// ---------------------------------------------------------------------

describe("canSendReminder", () => {
  it("allows a reminder when none has ever been sent", () => {
    expect(canSendReminder(makeRequest({ lastReminderSentAt: undefined }))).toBe(true);
  });

  it("blocks a reminder sent well within the 12-hour cooldown", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(canSendReminder(makeRequest({ lastReminderSentAt: oneHourAgo }))).toBe(false);
  });

  it("allows a reminder once the 12-hour cooldown has genuinely passed", () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    expect(canSendReminder(makeRequest({ lastReminderSentAt: thirteenHoursAgo }))).toBe(true);
  });
});

// ---------------------------------------------------------------------
// recordReminderSent
// ---------------------------------------------------------------------

describe("recordReminderSent", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("silently does nothing when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(recordReminderSent("req-1", "owner@example.com")).resolves.toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastReminderSentAt and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest({ lastReminderSentAt: undefined }) });
    await recordReminderSent("req-1", "owner@example.com");
    const [upserted] = mocks.upsert.mock.calls[0];
    expect(typeof upserted.lastReminderSentAt).toBe("string");
  });
});

// ---------------------------------------------------------------------
// regenerateDecisionToken
// ---------------------------------------------------------------------

describe("regenerateDecisionToken", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await regenerateDecisionToken("req-1", "owner@example.com")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  // The real point of this function: the freshly returned raw token
  // must hash to exactly what was actually stored, and the old hash
  // must genuinely be replaced, not appended alongside.
  it("returns a fresh raw token whose hash is exactly the newly-stored one, replacing the old hash", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest({ decisionTokenHash: "old-hash" }) });

    const raw = await regenerateDecisionToken("req-1", "owner@example.com");

    expect(raw).not.toBeNull();
    const [upserted] = mocks.upsert.mock.calls[0];
    expect(upserted.decisionTokenHash).toBe(hashToken(raw!));
    expect(upserted.decisionTokenHash).not.toBe("old-hash");
  });
});