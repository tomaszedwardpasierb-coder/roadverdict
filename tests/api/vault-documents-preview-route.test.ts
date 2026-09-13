// Place at: tests/api/vault-documents-preview-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Readable } from "stream";

const mocks = vi.hoisted(() => ({
  checkVaultGate: vi.fn(),
  extendVaultSession: vi.fn(),
  getVaultContainer: vi.fn(),
  download: vi.fn(),
  getVaultDocument: vi.fn(),
}));

vi.mock("@/lib/tracker/vaultAccess", () => ({ checkVaultGate: mocks.checkVaultGate }));
vi.mock("@/lib/tracker/vaultSession", () => ({ extendVaultSession: mocks.extendVaultSession }));
vi.mock("@/lib/blobStorage", () => ({ getVaultContainer: mocks.getVaultContainer }));
vi.mock("@/lib/tracker/vaultDocument", () => ({ getVaultDocument: mocks.getVaultDocument }));

import { GET } from "@/app/api/vault/documents/[id]/preview/route";

const EMAIL = "rider@example.com";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/documents/d1/preview");
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function fakeDownloadResponse(bytes: Buffer) {
  return { readableStreamBody: Readable.from([bytes]) };
}

describe("GET /api/vault/documents/[id]/preview", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkVaultGate.mockResolvedValue({ ok: true, email: EMAIL, raw: "raw-token" });
    mocks.getVaultDocument.mockResolvedValue({ id: "d1", pk: EMAIL, blobName: "abc.jpg", fileName: "insurance.jpg", fileType: "image/jpeg" });
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
    mocks.download.mockResolvedValue(fakeDownloadResponse(Buffer.from("original-image-bytes")));
  });

  it("rejects when the gate fails", async () => {
    mocks.checkVaultGate.mockResolvedValue({ ok: false, status: 401, error: "vault_locked" });
    const response = await GET(req(), params("d1"));
    expect(response.status).toBe(401);
    expect(mocks.getVaultDocument).not.toHaveBeenCalled();
  });

  it("404s when the document doesn't exist in the caller's own partition", async () => {
    mocks.getVaultDocument.mockResolvedValue(null);
    const response = await GET(req(), params("not-mine"));
    expect(response.status).toBe(404);
  });

  it("streams the ORIGINAL bytes, unmodified, with an inline disposition", async () => {
    const response = await GET(req(), params("d1"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="insurance.jpg"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe("original-image-bytes");
    expect(mocks.extendVaultSession).toHaveBeenCalledWith(EMAIL, "raw-token");
  });

  it("never writes anything back to blob storage - only ever reads the original", async () => {
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient });
    await GET(req(), params("d1"));

    expect(getBlockBlobClient).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("responds 500 when the blob download itself fails", async () => {
    mocks.download.mockRejectedValue(new Error("storage down"));
    const response = await GET(req(), params("d1"));
    expect(response.status).toBe(500);
  });
});
