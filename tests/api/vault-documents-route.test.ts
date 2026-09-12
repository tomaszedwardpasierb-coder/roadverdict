// Place at: tests/api/vault-documents-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkVaultGate: vi.fn(),
  extendVaultSession: vi.fn(),
  getBike: vi.fn(),
  getCarById: vi.fn(),
  getVaultContainer: vi.fn(),
  uploadData: vi.fn(),
  createVaultDocument: vi.fn(),
  getVaultDocumentsForVehicle: vi.fn(),
  countAndSizeVaultDocuments: vi.fn(),
}));

vi.mock("@/lib/tracker/vaultAccess", () => ({ checkVaultGate: mocks.checkVaultGate }));
vi.mock("@/lib/tracker/vaultSession", () => ({ extendVaultSession: mocks.extendVaultSession }));
vi.mock("@/lib/tracker/bike", () => ({ getBike: mocks.getBike }));
vi.mock("@/lib/tracker/car", () => ({ getCarById: mocks.getCarById }));
vi.mock("@/lib/blobStorage", () => ({ getVaultContainer: mocks.getVaultContainer }));
vi.mock("@/lib/tracker/vaultDocument", async () => {
  const actual = await vi.importActual<typeof import("@/lib/tracker/vaultDocument")>("@/lib/tracker/vaultDocument");
  return {
    ...actual,
    createVaultDocument: mocks.createVaultDocument,
    getVaultDocumentsForVehicle: mocks.getVaultDocumentsForVehicle,
    countAndSizeVaultDocuments: mocks.countAndSizeVaultDocuments,
  };
});

import { GET, POST } from "@/app/api/vault/documents/route";

const EMAIL = "rider@example.com";

function getReq(vehicleKind: string, vehicleId: string): NextRequest {
  return new NextRequest(`http://localhost/api/vault/documents?vehicleKind=${vehicleKind}&vehicleId=${vehicleId}`);
}

function postReq(fields: Record<string, string | File>): NextRequest {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return new NextRequest("http://localhost/api/vault/documents", { method: "POST", body: fd });
}

describe("GET /api/vault/documents", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkVaultGate.mockResolvedValue({ ok: true, email: EMAIL, raw: "raw-token" });
    mocks.getBike.mockResolvedValue({ id: "bike-1" });
    mocks.getCarById.mockResolvedValue({ id: "car-1" });
    mocks.getVaultDocumentsForVehicle.mockResolvedValue([]);
  });

  it("rejects when the gate fails, with the gate's own status/error", async () => {
    mocks.checkVaultGate.mockResolvedValue({ ok: false, status: 403, error: "The Vault is a Premium feature." });
    const response = await GET(getReq("bike", "bike-1"));
    expect(response.status).toBe(403);
    expect(mocks.getVaultDocumentsForVehicle).not.toHaveBeenCalled();
  });

  it("404s when the vehicleId doesn't belong to the caller's own account", async () => {
    mocks.getBike.mockResolvedValue(null);
    const response = await GET(getReq("bike", "someone-elses-bike"));
    expect(response.status).toBe(404);
    expect(mocks.getVaultDocumentsForVehicle).not.toHaveBeenCalled();
  });

  it("lists documents for an owned bike, and extends the vault session", async () => {
    const docs = [{ id: "d1" }];
    mocks.getVaultDocumentsForVehicle.mockResolvedValue(docs);
    const response = await GET(getReq("bike", "bike-1"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ documents: docs });
    expect(mocks.extendVaultSession).toHaveBeenCalledWith(EMAIL, "raw-token");
  });

  it("lists documents for an owned car via getCarById", async () => {
    const response = await GET(getReq("car", "car-1"));
    expect(response.status).toBe(200);
    expect(mocks.getCarById).toHaveBeenCalledWith(EMAIL, "car-1");
  });
});

describe("POST /api/vault/documents", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkVaultGate.mockResolvedValue({ ok: true, email: EMAIL, raw: "raw-token" });
    mocks.getBike.mockResolvedValue({ id: "bike-1" });
    mocks.getCarById.mockResolvedValue({ id: "car-1" });
    mocks.countAndSizeVaultDocuments.mockResolvedValue({ count: 0, totalBytes: 0 });
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient: () => ({ uploadData: mocks.uploadData }) });
    mocks.createVaultDocument.mockImplementation(async (email, data) => ({ id: "new-doc", pk: email, type: "vaultDocument", uploadedAt: "now", ...data }));
  });

  function validFile(type = "application/pdf") {
    return new File([new Uint8Array([1, 2, 3])], "v5c.pdf", { type });
  }

  it("rejects when the gate fails", async () => {
    mocks.checkVaultGate.mockResolvedValue({ ok: false, status: 401, error: "Not signed in." });
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(401);
  });

  it("rejects a request with no file", async () => {
    const response = await POST(postReq({ vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(400);
  });

  it("rejects an invalid category", async () => {
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "notARealCategory" }));
    expect(response.status).toBe(400);
  });

  it("rejects a disallowed file type", async () => {
    const response = await POST(postReq({ file: validFile("application/zip"), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(400);
  });

  it("rejects a file over the 10MB cap", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    const response = await POST(postReq({ file: big, vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(400);
  });

  it("404s when the vehicle isn't the caller's own", async () => {
    mocks.getBike.mockResolvedValue(null);
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "not-mine", category: "dvlaLegal" }));
    expect(response.status).toBe(404);
  });

  it("rejects once the vehicle already has 20 documents", async () => {
    mocks.countAndSizeVaultDocuments.mockResolvedValue({ count: 20, totalBytes: 1000 });
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(400);
    expect(mocks.createVaultDocument).not.toHaveBeenCalled();
  });

  it("rejects once the vehicle's total would exceed 100MB", async () => {
    mocks.countAndSizeVaultDocuments.mockResolvedValue({ count: 1, totalBytes: 100 * 1024 * 1024 - 1 });
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(400);
    expect(mocks.createVaultDocument).not.toHaveBeenCalled();
  });

  it("accepts a valid upload, uploads the blob, creates the doc, and extends the vault session", async () => {
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal", label: "My V5C" }));
    expect(response.status).toBe(200);
    expect(mocks.uploadData).toHaveBeenCalledTimes(1);
    expect(mocks.createVaultDocument).toHaveBeenCalledWith(
      EMAIL,
      expect.objectContaining({ vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal", label: "My V5C", fileType: "application/pdf" })
    );
    expect(mocks.extendVaultSession).toHaveBeenCalledWith(EMAIL, "raw-token");
  });

  it("omits label entirely when not provided, rather than storing an empty string", async () => {
    await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    const callArgs = mocks.createVaultDocument.mock.calls[0][1];
    expect(callArgs.label).toBeUndefined();
  });

  it("responds 500 when the blob upload itself fails", async () => {
    mocks.uploadData.mockRejectedValue(new Error("storage down"));
    const response = await POST(postReq({ file: validFile(), vehicleKind: "bike", vehicleId: "bike-1", category: "dvlaLegal" }));
    expect(response.status).toBe(500);
  });
});
