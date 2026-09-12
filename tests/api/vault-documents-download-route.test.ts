// Place at: tests/api/vault-documents-download-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { Readable } from "stream";

const mocks = vi.hoisted(() => ({
  checkVaultGate: vi.fn(),
  extendVaultSession: vi.fn(),
  getVaultContainer: vi.fn(),
  download: vi.fn(),
  getVaultDocument: vi.fn(),
  watermarkPdf: vi.fn(),
  watermarkImage: vi.fn(),
}));

vi.mock("@/lib/tracker/vaultAccess", () => ({ checkVaultGate: mocks.checkVaultGate }));
vi.mock("@/lib/tracker/vaultSession", () => ({ extendVaultSession: mocks.extendVaultSession }));
vi.mock("@/lib/blobStorage", () => ({ getVaultContainer: mocks.getVaultContainer }));
vi.mock("@/lib/tracker/vaultDocument", () => ({ getVaultDocument: mocks.getVaultDocument }));
vi.mock("@/lib/tracker/vaultWatermark", () => ({ watermarkPdf: mocks.watermarkPdf, watermarkImage: mocks.watermarkImage }));

import { GET } from "@/app/api/vault/documents/[id]/download/route";

const EMAIL = "rider@example.com";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/documents/d1/download");
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function fakeDownloadResponse(bytes: Buffer) {
  return { readableStreamBody: Readable.from([bytes]) };
}

describe("GET /api/vault/documents/[id]/download", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkVaultGate.mockResolvedValue({ ok: true, email: EMAIL, raw: "raw-token" });
    mocks.getVaultDocument.mockResolvedValue({ id: "d1", pk: EMAIL, blobName: "abc.pdf", fileName: "V5C.pdf", fileType: "application/pdf" });
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient: () => ({ download: mocks.download }) });
    mocks.download.mockResolvedValue(fakeDownloadResponse(Buffer.from("original-pdf-bytes")));
    mocks.watermarkPdf.mockResolvedValue(Buffer.from("watermarked-pdf-bytes"));
    mocks.watermarkImage.mockResolvedValue(Buffer.from("watermarked-image-bytes"));
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

  it("watermarks a PDF document, sets content-type/disposition, and never caches the response", async () => {
    const response = await GET(req(), params("d1"));
    expect(response.status).toBe(200);
    expect(mocks.watermarkPdf).toHaveBeenCalledWith(Buffer.from("original-pdf-bytes"), expect.stringContaining(EMAIL));
    expect(mocks.watermarkImage).not.toHaveBeenCalled();

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("V5C.pdf");
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = Buffer.from(await response.arrayBuffer());
    expect(body.toString()).toBe("watermarked-pdf-bytes");
    expect(mocks.extendVaultSession).toHaveBeenCalledWith(EMAIL, "raw-token");
  });

  it("watermarks an image document via watermarkImage, not watermarkPdf", async () => {
    mocks.getVaultDocument.mockResolvedValue({ id: "d2", pk: EMAIL, blobName: "abc.jpg", fileName: "insurance.jpg", fileType: "image/jpeg" });
    mocks.download.mockResolvedValue(fakeDownloadResponse(Buffer.from("original-jpeg-bytes")));

    const response = await GET(req(), params("d2"));
    expect(response.status).toBe(200);
    expect(mocks.watermarkImage).toHaveBeenCalledWith(Buffer.from("original-jpeg-bytes"), expect.stringContaining(EMAIL), "image/jpeg");
    expect(mocks.watermarkPdf).not.toHaveBeenCalled();
  });

  it("never writes anything back to blob storage - only ever reads the original", async () => {
    const getBlockBlobClient = vi.fn(() => ({ download: mocks.download }));
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient });
    await GET(req(), params("d1"));

    // The only blob-client method invoked is download() - no uploadData
    // was ever set up as a mock, and getBlockBlobClient is called just
    // once (for the read), confirming no separate write-back call happens.
    expect(getBlockBlobClient).toHaveBeenCalledTimes(1);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("responds 500 when the blob download itself fails", async () => {
    mocks.download.mockRejectedValue(new Error("storage down"));
    const response = await GET(req(), params("d1"));
    expect(response.status).toBe(500);
  });
});
