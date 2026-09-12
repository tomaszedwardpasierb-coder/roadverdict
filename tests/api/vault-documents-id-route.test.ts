// Place at: tests/api/vault-documents-id-route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  checkVaultGate: vi.fn(),
  extendVaultSession: vi.fn(),
  getVaultContainer: vi.fn(),
  deleteIfExists: vi.fn(),
  getVaultDocument: vi.fn(),
  deleteVaultDocument: vi.fn(),
}));

vi.mock("@/lib/tracker/vaultAccess", () => ({ checkVaultGate: mocks.checkVaultGate }));
vi.mock("@/lib/tracker/vaultSession", () => ({ extendVaultSession: mocks.extendVaultSession }));
vi.mock("@/lib/blobStorage", () => ({ getVaultContainer: mocks.getVaultContainer }));
vi.mock("@/lib/tracker/vaultDocument", () => ({
  getVaultDocument: mocks.getVaultDocument,
  deleteVaultDocument: mocks.deleteVaultDocument,
}));

import { DELETE } from "@/app/api/vault/documents/[id]/route";

const EMAIL = "rider@example.com";

function req(): NextRequest {
  return new NextRequest("http://localhost/api/vault/documents/d1", { method: "DELETE" });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("DELETE /api/vault/documents/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.checkVaultGate.mockResolvedValue({ ok: true, email: EMAIL, raw: "raw-token" });
    mocks.getVaultContainer.mockResolvedValue({ getBlockBlobClient: () => ({ deleteIfExists: mocks.deleteIfExists }) });
    mocks.getVaultDocument.mockResolvedValue({ id: "d1", pk: EMAIL, blobName: "abc.pdf" });
  });

  it("rejects when the gate fails", async () => {
    mocks.checkVaultGate.mockResolvedValue({ ok: false, status: 401, error: "Not signed in." });
    const response = await DELETE(req(), params("d1"));
    expect(response.status).toBe(401);
    expect(mocks.getVaultDocument).not.toHaveBeenCalled();
  });

  it("404s when the document doesn't exist within the caller's own partition", async () => {
    mocks.getVaultDocument.mockResolvedValue(null);
    const response = await DELETE(req(), params("not-mine"));
    expect(response.status).toBe(404);
    expect(mocks.deleteVaultDocument).not.toHaveBeenCalled();
  });

  it("deletes the blob and the doc, then extends the vault session", async () => {
    const response = await DELETE(req(), params("d1"));
    expect(response.status).toBe(200);
    expect(mocks.deleteIfExists).toHaveBeenCalledOnce();
    expect(mocks.deleteVaultDocument).toHaveBeenCalledWith(EMAIL, "d1");
    expect(mocks.extendVaultSession).toHaveBeenCalledWith(EMAIL, "raw-token");
  });
});
