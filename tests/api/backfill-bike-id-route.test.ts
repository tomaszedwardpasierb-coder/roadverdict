import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

interface QueryCall {
  query: string;
  parameters?: { name: string; value: unknown }[];
}

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: mocks.query, upsert: mocks.upsert },
  }),
}));

import { POST } from "@/app/api/cron/backfill-bike-id/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/backfill-bike-id", { method: "POST", headers });
}

// A tiny in-memory fake standing in for Cosmos, dispatched purely off the
// query text/parameters, since the route issues several structurally
// different queries against the same mocked container.
function setupCosmos(state: {
  bikes: { id: string; pk: string }[];
  docsByEmailAndType?: Record<string, Record<string, unknown[]>>; // email -> type -> docs
  shareLinks?: { id: string; email: string }[];
  bikesByEmailForShareLinks?: Record<string, { id: string; dateAdded: string }[]>;
}) {
  mocks.query.mockImplementation((q: QueryCall, options?: { partitionKey?: string }) => {
    const text = q.query;
    if (text.includes("c.type = 'bike'") && text.includes("ORDER BY c.dateAdded ASC")) {
      const email = options?.partitionKey as string;
      const bikes = state.bikesByEmailForShareLinks?.[email] ?? [];
      return { fetchAll: () => Promise.resolve({ resources: bikes }) };
    }
    if (text === "SELECT * FROM c WHERE c.type = 'bike'") {
      return { fetchAll: () => Promise.resolve({ resources: state.bikes }) };
    }
    if (text.includes("NOT IS_DEFINED(c.bikeId)") && text.includes("@type")) {
      const type = q.parameters?.find((p) => p.name === "@type")?.value as string;
      const email = options?.partitionKey as string;
      const docs = state.docsByEmailAndType?.[email]?.[type] ?? [];
      return { fetchAll: () => Promise.resolve({ resources: docs }) };
    }
    if (text.includes("c.type = 'shareLink' AND NOT IS_DEFINED(c.bikeId)")) {
      return { fetchAll: () => Promise.resolve({ resources: state.shareLinks ?? [] }) };
    }
    return { fetchAll: () => Promise.resolve({ resources: [] }) };
  });
}

describe("POST /api/cron/backfill-bike-id", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.upsert.mockReset();
    mocks.upsert.mockResolvedValue(undefined);
    process.env.CRON_SECRET = "top-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("no-ops cleanly when there are no bikes and no orphaned share links", async () => {
    setupCosmos({ bikes: [], shareLinks: [] });
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true, bikesProcessed: 0, docsPatched: 0, shareLinksPatched: 0, perBike: [],
    });
  });

  it("patches every tracker doc missing a bikeId with the owning bike's id", async () => {
    setupCosmos({
      bikes: [{ id: "bike-1", pk: "owner@example.com" }],
      docsByEmailAndType: {
        "owner@example.com": {
          serviceRecord: [{ id: "s1", type: "serviceRecord" }],
          fuelLog: [{ id: "f1", type: "fuelLog" }],
        },
      },
      shareLinks: [],
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.bikesProcessed).toBe(1);
    expect(body.docsPatched).toBe(2);
    expect(body.perBike).toEqual([{ email: "owner@example.com", bikeId: "bike-1", patched: 2 }]);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "s1", bikeId: "bike-1" }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "f1", bikeId: "bike-1" }));
  });

  it("patches an orphaned share link with its owner's primary (oldest) bike", async () => {
    setupCosmos({
      bikes: [],
      shareLinks: [{ id: "token-1", email: "owner@example.com" }],
      bikesByEmailForShareLinks: {
        "owner@example.com": [
          { id: "bike-old", dateAdded: "2024-01-01" },
          { id: "bike-new", dateAdded: "2025-01-01" },
        ],
      },
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.shareLinksPatched).toBe(1);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "token-1", bikeId: "bike-old" }));
  });

  it("skips a share link whose owner has no bikes at all, rather than patching a bogus id", async () => {
    setupCosmos({
      bikes: [],
      shareLinks: [{ id: "token-1", email: "ghost@example.com" }],
      bikesByEmailForShareLinks: {},
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();
    expect(body.shareLinksPatched).toBe(0);
    expect(mocks.upsert).not.toHaveBeenCalledWith(expect.objectContaining({ id: "token-1" }));
  });

  it("writes a cronStatus summary doc once the run completes", async () => {
    setupCosmos({ bikes: [], shareLinks: [] });
    await POST(request({ authorization: "Bearer top-secret" }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::backfillBikeId", pk: "system", type: "cronStatus",
    }));
  });

  it("isolates a single doc's upsert failure and still patches the rest of the run", async () => {
    setupCosmos({
      bikes: [
        { id: "bike-1", pk: "owner1@example.com" },
        { id: "bike-2", pk: "owner2@example.com" },
      ],
      docsByEmailAndType: {
        "owner1@example.com": { serviceRecord: [{ id: "s1", type: "serviceRecord" }] },
        "owner2@example.com": { serviceRecord: [{ id: "s2", type: "serviceRecord" }] },
      },
      shareLinks: [],
    });
    mocks.upsert.mockImplementation(async (doc: { id: string }) => {
      if (doc.id === "s1") throw new Error("write conflict");
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    // bike-2's doc was still reached and patched despite bike-1's failure.
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "s2", bikeId: "bike-2" }));
    expect(body.docsPatched).toBe(1);
    expect(body.errors).toEqual([{ id: "s1", bikeId: "bike-1", error: "write conflict" }]);
  });
});
