// Mirrors bikeTransferRequest.test.ts for the car equivalent.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateToken: vi.fn(),
  hashToken: vi.fn(),
  upsert: vi.fn(),
  query: vi.fn(),
  read: vi.fn(),
  item: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      upsert: mocks.upsert,
      query: mocks.query,
    },
    item: mocks.item,
  }),
}));
vi.mock("@/lib/auth/crypto", () => ({
  generateToken: mocks.generateToken,
  hashToken: mocks.hashToken,
}));

import {
  createCarTransferRequest,
  getPendingCarTransferRequestsForOwner,
  hasActiveCarTransferRequestForCar,
  getCarTransferRequestByToken,
  getCarTransferRequestById,
  decideCarTransferRequest,
} from "@/lib/tracker/carTransferRequest";

const ownerEmail = "owner@example.com";
const recipientEmail = "buyer@example.com";
const carId = "car-1";
const carSummary = { make: "Ford", model: "Focus", year: 2020, isCustomBuild: false };

const existingDoc = {
  id: `${ownerEmail}::carTransferRequest::1234`,
  pk: ownerEmail,
  type: "carTransferRequest",
  carId,
  ownerEmail,
  recipientEmail,
  initiatedBy: "owner",
  status: "pending",
  tokenHash: "hashed-token",
  createdAt: "2025-01-01T00:00:00.000Z",
  carSummary,
  ttl: 604800,
} as any;

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.generateToken.mockReturnValue({ raw: "raw-token-abc", hash: "hashed-abc" });
  mocks.hashToken.mockReturnValue("hashed-abc");
  mocks.upsert.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
  mocks.item.mockReturnValue({ read: mocks.read });
  mocks.read.mockResolvedValue({ resource: null });
});

describe("createCarTransferRequest", () => {
  it("calls generateToken and stores the hash (never the raw token) in the document", async () => {
    const { doc, token } = await createCarTransferRequest({
      ownerEmail, carId, recipientEmail, carSummary,
    });
    expect(token).toBe("raw-token-abc");
    expect(doc.tokenHash).toBe("hashed-abc");
    expect(JSON.stringify(doc)).not.toContain("raw-token-abc");
  });

  it("persists the document via upsert", async () => {
    await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("defaults initiatedBy to 'owner' when not specified", async () => {
    const { doc } = await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(doc.initiatedBy).toBe("owner");
  });

  it("respects an explicit initiatedBy value", async () => {
    const { doc } = await createCarTransferRequest({
      ownerEmail, carId, recipientEmail, carSummary, initiatedBy: "recipient",
    });
    expect(doc.initiatedBy).toBe("recipient");
  });

  it("sets status to pending", async () => {
    const { doc } = await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(doc.status).toBe("pending");
  });

  it("snapshots the car summary into the document", async () => {
    const { doc } = await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(doc.carSummary).toEqual(carSummary);
  });

  it("stores includeRecords when provided", async () => {
    const { doc } = await createCarTransferRequest({
      ownerEmail, carId, recipientEmail, carSummary, includeRecords: true,
    });
    expect(doc.includeRecords).toBe(true);
  });

  it("partitions the document by ownerEmail (pk = ownerEmail)", async () => {
    const { doc } = await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(doc.pk).toBe(ownerEmail);
  });

  it("sets a non-zero TTL", async () => {
    const { doc } = await createCarTransferRequest({ ownerEmail, carId, recipientEmail, carSummary });
    expect(doc.ttl).toBeGreaterThan(0);
  });
});

describe("getPendingCarTransferRequestsForOwner", () => {
  it("returns pending requests for the given owner", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [existingDoc] }) });
    const result = await getPendingCarTransferRequestsForOwner(ownerEmail);
    expect(result).toEqual([existingDoc]);
  });

  it("returns an empty array when there are no pending requests", async () => {
    const result = await getPendingCarTransferRequestsForOwner(ownerEmail);
    expect(result).toEqual([]);
  });
});

describe("hasActiveCarTransferRequestForCar", () => {
  it("returns true when a pending or accepted request exists", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [{ id: "req-1" }] }) });
    const result = await hasActiveCarTransferRequestForCar(ownerEmail, carId);
    expect(result).toBe(true);
  });

  it("returns false when no active request exists", async () => {
    const result = await hasActiveCarTransferRequestForCar(ownerEmail, carId);
    expect(result).toBe(false);
  });
});

describe("getCarTransferRequestByToken", () => {
  it("hashes the raw token before querying", async () => {
    mocks.hashToken.mockReturnValue("hashed-lookup");
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [existingDoc] }) });
    await getCarTransferRequestByToken("raw-token");
    expect(mocks.hashToken).toHaveBeenCalledWith("raw-token");
  });

  it("returns the matching document when found", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [existingDoc] }) });
    const result = await getCarTransferRequestByToken("raw-token");
    expect(result).toEqual(existingDoc);
  });

  it("returns null when no document matches the token", async () => {
    const result = await getCarTransferRequestByToken("unknown-token");
    expect(result).toBeNull();
  });
});

describe("getCarTransferRequestById", () => {
  it("returns the document when found", async () => {
    mocks.read.mockResolvedValue({ resource: existingDoc });
    const result = await getCarTransferRequestById(existingDoc.id, ownerEmail);
    expect(result).toEqual(existingDoc);
  });

  it("returns null when no document is found", async () => {
    const result = await getCarTransferRequestById("nonexistent-id", ownerEmail);
    expect(result).toBeNull();
  });

  it("reads using the requestId and ownerEmail as partition key", async () => {
    mocks.read.mockResolvedValue({ resource: existingDoc });
    await getCarTransferRequestById(existingDoc.id, ownerEmail);
    expect(mocks.item).toHaveBeenCalledWith(existingDoc.id, ownerEmail);
  });
});

describe("decideCarTransferRequest", () => {
  it("returns null when the request does not exist", async () => {
    const result = await decideCarTransferRequest("nonexistent-id", ownerEmail, "accepted");
    expect(result).toBeNull();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("sets status to accepted and persists when decision is accepted", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    const result = await decideCarTransferRequest(existingDoc.id, ownerEmail, "accepted");
    expect(result?.status).toBe("accepted");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("sets status to declined and persists when decision is declined", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    const result = await decideCarTransferRequest(existingDoc.id, ownerEmail, "declined");
    expect(result?.status).toBe("declined");
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it("sets decidedAt to a non-empty ISO timestamp", async () => {
    mocks.read.mockResolvedValue({ resource: { ...existingDoc } });
    const result = await decideCarTransferRequest(existingDoc.id, ownerEmail, "accepted");
    expect(result?.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
