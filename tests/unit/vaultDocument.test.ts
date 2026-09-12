import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), upsert: vi.fn(), fetchAll: vi.fn(), deleteFn: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    item: () => ({ read: mocks.read, delete: mocks.deleteFn }),
    items: {
      upsert: mocks.upsert,
      query: (queryObj: unknown) => ({ fetchAll: () => mocks.fetchAll(queryObj) }),
    },
  }),
}));

import {
  createVaultDocument,
  getVaultDocument,
  getVaultDocumentsForVehicle,
  countAndSizeVaultDocuments,
  deleteVaultDocument,
  VAULT_CATEGORIES,
  VAULT_MAX_DOCUMENTS_PER_VEHICLE,
  VAULT_MAX_FILE_SIZE_BYTES,
  VAULT_MAX_TOTAL_BYTES_PER_VEHICLE,
} from "@/lib/tracker/vaultDocument";

beforeEach(() => {
  mocks.read.mockReset();
  mocks.upsert.mockReset();
  mocks.fetchAll.mockReset();
  mocks.deleteFn.mockReset();
});

describe("createVaultDocument", () => {
  it("creates a doc partitioned by email with the given fields", async () => {
    const doc = await createVaultDocument("owner@example.com", {
      vehicleKind: "bike",
      vehicleId: "bike-1",
      blobName: "abc123.pdf",
      fileName: "V5C.pdf",
      fileType: "application/pdf",
      fileSize: 12345,
      category: "dvlaLegal",
    });

    expect(doc.pk).toBe("owner@example.com");
    expect(doc.type).toBe("vaultDocument");
    expect(doc.vehicleKind).toBe("bike");
    expect(doc.vehicleId).toBe("bike-1");
    expect(doc.blobName).toBe("abc123.pdf");
    expect(doc.fileSize).toBe(12345);
    expect(doc.category).toBe("dvlaLegal");
    expect(doc.uploadedAt).toBeDefined();
    expect(mocks.upsert).toHaveBeenCalledWith(doc);
  });

  it("generates a different id on every call", async () => {
    const data = {
      vehicleKind: "bike" as const,
      vehicleId: "bike-1",
      blobName: "a.pdf",
      fileName: "a.pdf",
      fileType: "application/pdf" as const,
      fileSize: 1,
      category: "insurance" as const,
    };
    const first = await createVaultDocument("owner@example.com", data);
    const second = await createVaultDocument("owner@example.com", data);
    expect(first.id).not.toBe(second.id);
  });

  it("carries an optional label through when provided", async () => {
    const doc = await createVaultDocument("owner@example.com", {
      vehicleKind: "car",
      vehicleId: "car-1",
      blobName: "b.jpg",
      fileName: "insurance.jpg",
      fileType: "image/jpeg",
      fileSize: 500,
      category: "insurance",
      label: "Insurance 2026",
    });
    expect(doc.label).toBe("Insurance 2026");
  });
});

describe("getVaultDocument", () => {
  it("returns the doc when it exists", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "d1", pk: "owner@example.com", type: "vaultDocument", vehicleId: "bike-1" } });
    await expect(getVaultDocument("owner@example.com", "d1")).resolves.toEqual({
      id: "d1",
      pk: "owner@example.com",
      type: "vaultDocument",
      vehicleId: "bike-1",
    });
  });

  it("returns null when no doc exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(getVaultDocument("owner@example.com", "missing")).resolves.toBeNull();
  });
});

describe("getVaultDocumentsForVehicle", () => {
  it("queries scoped to the vehicleId within the caller's own partition", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await getVaultDocumentsForVehicle("owner@example.com", "bike-1");

    const queryObj = mocks.fetchAll.mock.calls[0][0] as { query: string; parameters: { name: string; value: unknown }[] };
    expect(queryObj.query).toContain("c.vehicleId = @vehicleId");
    expect(queryObj.parameters).toEqual(expect.arrayContaining([{ name: "@vehicleId", value: "bike-1" }]));
  });

  it("returns the resources found", async () => {
    const docs = [{ id: "d1", pk: "owner@example.com", type: "vaultDocument", vehicleId: "bike-1" }];
    mocks.fetchAll.mockResolvedValue({ resources: docs });
    await expect(getVaultDocumentsForVehicle("owner@example.com", "bike-1")).resolves.toEqual(docs);
  });
});

describe("countAndSizeVaultDocuments", () => {
  it("sums fileSize across every doc for the vehicle", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ fileSize: 100 }, { fileSize: 250 }] });
    await expect(countAndSizeVaultDocuments("owner@example.com", "bike-1")).resolves.toEqual({ count: 2, totalBytes: 350 });
  });

  it("returns zeroes when the vehicle has no documents yet", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    await expect(countAndSizeVaultDocuments("owner@example.com", "bike-1")).resolves.toEqual({ count: 0, totalBytes: 0 });
  });
});

describe("deleteVaultDocument", () => {
  it("deletes the doc by id within the caller's partition", async () => {
    await deleteVaultDocument("owner@example.com", "d1");
    expect(mocks.deleteFn).toHaveBeenCalled();
  });
});

describe("VAULT_CATEGORIES", () => {
  it("has exactly the 7 categories from the spec, each with a label and examples", () => {
    expect(VAULT_CATEGORIES).toHaveLength(7);
    const keys = VAULT_CATEGORIES.map((c) => c.key);
    expect(keys).toEqual(["dvlaLegal", "insurance", "purchaseFinance", "licences", "modifications", "warranties", "overseas"]);
    for (const category of VAULT_CATEGORIES) {
      expect(category.label.length).toBeGreaterThan(0);
      expect(category.examples.length).toBeGreaterThan(0);
    }
  });
});

describe("caps", () => {
  it("matches the spec's document/file-size/total-size limits", () => {
    expect(VAULT_MAX_DOCUMENTS_PER_VEHICLE).toBe(20);
    expect(VAULT_MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
    expect(VAULT_MAX_TOTAL_BYTES_PER_VEHICLE).toBe(100 * 1024 * 1024);
  });
});
