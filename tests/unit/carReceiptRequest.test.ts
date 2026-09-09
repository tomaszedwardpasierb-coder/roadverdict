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
// mocked - real, pure SHA-256/randomBytes, same reasoning as
// receiptRequest.test.ts.

import { hashToken } from "@/lib/auth/crypto";
import {
  createCarReceiptRequest,
  getCarReceiptRequestsForShareToken,
  deleteCarReceiptRequestsForShareToken,
  purgeOrphanedCarReceiptRequests,
  getPendingCarReceiptRequestsForOwner,
  getCarReceiptRequestByDecisionToken,
  decideCarReceiptRequestItems,
  canSendCarReminder,
  recordCarReminderSent,
  regenerateCarDecisionToken,
  CAR_DEFAULT_DECLINE_REASON,
  type CarReceiptRequestDoc,
} from "@/lib/tracker/carReceiptRequest";

function resetAllMocks() {
  Object.values(mocks).forEach((m) => m.mockReset());
  mockContainer.item.mockReset();
  mockContainer.item.mockImplementation((_id?: string, _pk?: string) => ({ read: mocks.read, delete: mocks.deleteFn }));
  mockContainer.items.query.mockClear();
}

function makeRequest(overrides: Partial<CarReceiptRequestDoc> = {}): CarReceiptRequestDoc {
  return {
    id: "owner@example.com::carReceiptRequest::1000",
    pk: "owner@example.com",
    type: "carReceiptRequest",
    shareToken: "tok_abc123",
    carId: "car-1",
    buyerEmail: "buyer@example.com",
    items: [{ entryId: "sr-1", category: "service", description: "Oil change", status: "pending" }],
    decisionTokenHash: "somehash",
    createdAt: "2025-01-01T00:00:00.000Z",
    ttl: 7776000,
    ...overrides,
  };
}

describe("createCarReceiptRequest", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("stores every item as pending, regardless of what status the caller passed in", async () => {
    const { doc } = await createCarReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", carId: "car-1",
      items: [{ entryId: "sr-1", category: "service", description: "Oil change" }],
    });
    expect(doc.items[0].status).toBe("pending");
  });

  it("returns a raw decision token whose hash is exactly what got stored", async () => {
    const { doc, decisionToken } = await createCarReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", carId: "car-1", items: [],
    });
    expect(doc.decisionTokenHash).toBe(hashToken(decisionToken));
  });

  it("scopes the doc's id and partition key to the owner's email", async () => {
    const { doc } = await createCarReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", carId: "car-1", items: [],
    });
    expect(doc.pk).toBe("owner@example.com");
    expect(doc.id.startsWith("owner@example.com::carReceiptRequest::")).toBe(true);
  });

  it("sets a 90-day ttl", async () => {
    const { doc } = await createCarReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", carId: "car-1", items: [],
    });
    expect(doc.ttl).toBe(90 * 24 * 60 * 60);
  });

  it("upserts the exact document it returns", async () => {
    const { doc } = await createCarReceiptRequest({
      ownerEmail: "owner@example.com", shareToken: "tok_abc123", carId: "car-1", items: [],
    });
    expect(mocks.upsert).toHaveBeenCalledWith(doc);
  });
});

describe("getCarReceiptRequestsForShareToken", () => {
  beforeEach(resetAllMocks);

  it("queries within the owner's own partition, filtered to the given share token", async () => {
    const requests = [makeRequest()];
    mocks.fetchAll.mockResolvedValue({ resources: requests });

    const result = await getCarReceiptRequestsForShareToken("owner@example.com", "tok_abc123");

    expect(result).toEqual(requests);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@shareToken", value: "tok_abc123" }]);
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });
});

describe("deleteCarReceiptRequestsForShareToken", () => {
  beforeEach(resetAllMocks);

  it("deletes every request tied to that share token and returns the count", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [makeRequest({ id: "req-1" }), makeRequest({ id: "req-2" })],
    });

    const count = await deleteCarReceiptRequestsForShareToken("owner@example.com", "tok_abc123");

    expect(count).toBe(2);
    expect(mockContainer.item).toHaveBeenCalledWith("req-1", "owner@example.com");
    expect(mockContainer.item).toHaveBeenCalledWith("req-2", "owner@example.com");
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
  });

  it("returns 0 and deletes nothing when there are no requests for that token", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await deleteCarReceiptRequestsForShareToken("owner@example.com", "tok_abc123")).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});

describe("purgeOrphanedCarReceiptRequests", () => {
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

    const count = await purgeOrphanedCarReceiptRequests();

    expect(count).toBe(1);
    expect(mocks.deleteFn).toHaveBeenCalledTimes(1);
  });

  it("is safe to re-run once the backlog is clear - returns 0 with nothing to delete", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await purgeOrphanedCarReceiptRequests()).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});

describe("getPendingCarReceiptRequestsForOwner", () => {
  beforeEach(resetAllMocks);

  it("scopes the query to the owner's own partition", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getPendingCarReceiptRequestsForOwner("owner@example.com");
    const [, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(options).toEqual({ partitionKey: "owner@example.com" });
  });

  it("excludes a request where every item has already been decided", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [makeRequest({ id: "req-1", items: [{ entryId: "sr-1", category: "service", description: "x", status: "approved" }] })],
    });
    expect(await getPendingCarReceiptRequestsForOwner("owner@example.com")).toEqual([]);
  });

  it("includes a request that still has at least one pending item", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [makeRequest({ id: "req-1" })] });
    const result = await getPendingCarReceiptRequestsForOwner("owner@example.com");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("req-1");
  });

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

    const result = await getPendingCarReceiptRequestsForOwner("owner@example.com");

    const pendingRequest = result.find((r) => r.id === "req-new")!;
    expect(pendingRequest.items[0].priorDecline).toEqual({ decidedAt: "2025-01-02T00:00:00.000Z", reason: "too personal" });
  });
});

describe("getCarReceiptRequestByDecisionToken", () => {
  beforeEach(resetAllMocks);

  it("hashes the raw token and queries by that hash", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getCarReceiptRequestByDecisionToken("raw-token-value");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.parameters).toEqual([{ name: "@hash", value: hashToken("raw-token-value") }]);
  });

  it("returns the matching request when found", async () => {
    const request = makeRequest();
    mocks.fetchAll.mockResolvedValue({ resources: [request] });
    expect(await getCarReceiptRequestByDecisionToken("raw-token-value")).toEqual(request);
  });

  it("returns null when no request matches that hash", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    expect(await getCarReceiptRequestByDecisionToken("raw-token-value")).toBeNull();
  });
});

describe("decideCarReceiptRequestItems", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "approved")).toBeNull();
  });

  it("declines with a custom reason and sets decidedAt", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest() });
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "declined", "too personal");
    expect(result?.items[0]).toMatchObject({ status: "declined", reason: "too personal" });
    expect(typeof result?.items[0].decidedAt).toBe("string");
  });

  it("falls back to the car-flavoured default decline reason when none (or only whitespace) is given", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest() });
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "declined", "   ");
    expect(result?.items[0].reason).toBe(CAR_DEFAULT_DECLINE_REASON);
  });

  it("strips the reason entirely on approval, even if one was previously set", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({ items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "old reason", decidedAt: "2025-01-01T00:00:00.000Z" }] }),
    });
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "approved");
    expect(result?.items[0].status).toBe("approved");
    expect("reason" in result!.items[0]).toBe(false);
  });

  it("clears both reason and decidedAt when reverted back to pending", async () => {
    mocks.read.mockResolvedValue({
      resource: makeRequest({ items: [{ entryId: "sr-1", category: "service", description: "x", status: "declined", reason: "old reason", decidedAt: "2025-01-01T00:00:00.000Z" }] }),
    });
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "pending");
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
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", ["sr-1"], "approved");
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
    const result = await decideCarReceiptRequestItems("req-1", "owner@example.com", "all", "approved");
    expect(result?.items.every((i) => i.status === "approved")).toBe(true);
  });
});

describe("canSendCarReminder", () => {
  it("allows a reminder when none has ever been sent", () => {
    expect(canSendCarReminder(makeRequest({ lastReminderSentAt: undefined }))).toBe(true);
  });

  it("blocks a reminder sent well within the 12-hour cooldown", () => {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(canSendCarReminder(makeRequest({ lastReminderSentAt: oneHourAgo }))).toBe(false);
  });

  it("allows a reminder once the 12-hour cooldown has genuinely passed", () => {
    const thirteenHoursAgo = new Date(Date.now() - 13 * 60 * 60 * 1000).toISOString();
    expect(canSendCarReminder(makeRequest({ lastReminderSentAt: thirteenHoursAgo }))).toBe(true);
  });
});

describe("recordCarReminderSent", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("silently does nothing when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(recordCarReminderSent("req-1", "owner@example.com")).resolves.toBeUndefined();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stamps lastReminderSentAt and upserts", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest({ lastReminderSentAt: undefined }) });
    await recordCarReminderSent("req-1", "owner@example.com");
    const [upserted] = mocks.upsert.mock.calls[0];
    expect(typeof upserted.lastReminderSentAt).toBe("string");
  });
});

describe("regenerateCarDecisionToken", () => {
  beforeEach(() => {
    resetAllMocks();
    mocks.upsert.mockResolvedValue(undefined);
  });

  it("returns null and does not upsert when the request doesn't exist", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    expect(await regenerateCarDecisionToken("req-1", "owner@example.com")).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("returns a fresh raw token whose hash is exactly the newly-stored one, replacing the old hash", async () => {
    mocks.read.mockResolvedValue({ resource: makeRequest({ decisionTokenHash: "old-hash" }) });

    const raw = await regenerateCarDecisionToken("req-1", "owner@example.com");

    expect(raw).not.toBeNull();
    const [upserted] = mocks.upsert.mock.calls[0];
    expect(upserted.decisionTokenHash).toBe(hashToken(raw!));
    expect(upserted.decisionTokenHash).not.toBe("old-hash");
  });
});
