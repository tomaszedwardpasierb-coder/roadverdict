// Place at: tests/api/feedback-upload-attachment-route.test.ts
//
// Mirrors tests/api/upload-attachment-route.test.ts's own conventions -
// the one behaviour genuinely specific to THIS route (over the tracker's
// own upload route) is that PDF is rejected here, even though it's
// allowed there. That's the one case worth its own explicit assertion;
// everything else (auth gate, size cap, byte-signature sniffing, upload
// failure) is exercised the same way, once each, not duplicated in full.
import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  uploadData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer, BLOB_UPLOAD_TIMEOUT_MS: 60_000 }));

import { POST } from "@/app/api/account/feedback/upload-attachment/route";

function requestWithFile(file: File): NextRequest {
  const fd = new FormData();
  fd.set("file", file);
  return new NextRequest("http://localhost/api/account/feedback/upload-attachment", { method: "POST", body: fd });
}

const SIGNATURE_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34],
};
function validFile(type = "image/jpeg", name = "a.jpg", extraBytes = 0): File {
  const signature = SIGNATURE_BYTES[type] ?? [1, 2, 3];
  const bytes = new Uint8Array(signature.length + extraBytes);
  bytes.set(signature);
  return new File([bytes], name, { type });
}

describe("POST /api/account/feedback/upload-attachment", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient: () => ({ uploadData: mocks.uploadData }) });
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(requestWithFile(validFile()));
    expect(response.status).toBe(401);
  });

  // The whole point of this route existing separately from the
  // tracker's own upload-attachment route: PDF is a valid receipt
  // attachment there, but not a valid bug-report screenshot here.
  it("rejects a PDF, even though the tracker's own upload route allows one", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithFile(validFile("application/pdf", "invoice.pdf")));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Only JPG or PNG files are allowed." });
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
  ])("accepts %s and names the blob with a .%s extension", async (type, ext) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithFile(validFile(type, "a.dat")));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachment.blobName).toMatch(new RegExp(`\\.${ext}$`));
  });

  it("rejects a file larger than the 10MB cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const big = validFile("image/jpeg", "a.jpg", 10 * 1024 * 1024 + 1 - SIGNATURE_BYTES["image/jpeg"].length);
    const response = await POST(requestWithFile(big));
    expect(response.status).toBe(400);
  });

  it("rejects a file whose bytes don't match its declared type", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const mislabelled = new File([new Uint8Array([1, 2, 3, 4])], "fake.png", { type: "image/png" });
    const response = await POST(requestWithFile(mislabelled));
    expect(response.status).toBe(400);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("responds 500 without leaking internal error detail when the upload itself fails", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.uploadData.mockRejectedValue(new Error("storage account unavailable"));
    const response = await POST(requestWithFile(validFile()));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Upload failed. Please try again." });
  });
});
