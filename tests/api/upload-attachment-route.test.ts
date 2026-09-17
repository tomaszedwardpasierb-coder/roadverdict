import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  uploadData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer, BLOB_UPLOAD_TIMEOUT_MS: 60_000 }));

import { POST } from "@/app/api/tracker/upload-attachment/route";

function requestWithFile(file: File): NextRequest {
  const fd = new FormData();
  fd.set("file", file);
  return new NextRequest("http://localhost/api/tracker/upload-attachment", { method: "POST", body: fd });
}

// Real magic bytes for each declared type - the route now sniffs the
// actual file contents, not just the declared Content-Type, so a fake
// single-byte body (the old fixture) would be rejected before ever
// reaching the code path most of these tests mean to exercise.
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

function requestWithoutFile(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/upload-attachment", { method: "POST", body: new FormData() });
}

function requestBadBody(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/upload-attachment", {
    method: "POST",
    headers: { "content-type": "multipart/form-data; boundary=x" },
    body: "not actually multipart",
  });
}

describe("POST /api/tracker/upload-attachment", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAttachmentContainer.mockResolvedValue({
      getBlockBlobClient: () => ({ uploadData: mocks.uploadData }),
    });
  });

  it("rejects unauthenticated requests, before ever reading the upload", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(requestWithFile(validFile()));
    expect(response.status).toBe(401);
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("rejects a malformed (non-multipart) upload", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestBadBody());
    expect(response.status).toBe(400);
  });

  it("rejects a request with no file", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithoutFile());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No file provided." });
  });

  it.each(["image/gif", "application/zip", "text/plain"])(
    "rejects a disallowed file type (%s)",
    async (type) => {
      mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
      const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.dat", { type })));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Only JPG, PNG, or PDF files are allowed." });
    }
  );

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["application/pdf", "pdf"],
  ])("accepts %s and names the blob with a .%s extension", async (type, ext) => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const getBlockBlobClient = vi.fn(() => ({ uploadData: mocks.uploadData }));
    mocks.getAttachmentContainer.mockResolvedValue({ getBlockBlobClient });

    const response = await POST(requestWithFile(validFile(type, "a.dat")));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachment.blobName).toMatch(new RegExp(`\\.${ext}$`));
    expect(getBlockBlobClient).toHaveBeenCalledWith(body.attachment.blobName);
  });

  it("rejects a file larger than the 10MB cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const big = validFile("image/jpeg", "a.jpg", 10 * 1024 * 1024 + 1 - SIGNATURE_BYTES["image/jpeg"].length);
    const response = await POST(requestWithFile(big));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File is too large - 10MB maximum." });
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("allows a file exactly at the 10MB cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const exact = validFile("image/jpeg", "a.jpg", 10 * 1024 * 1024 - SIGNATURE_BYTES["image/jpeg"].length);
    const response = await POST(requestWithFile(exact));
    expect(response.status).toBe(200);
  });

  it("uploads the file's real bytes with its content type set as blobHTTPHeaders", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const file = validFile("image/jpeg", "a.jpg");
    const expectedBytes = new Uint8Array(await file.arrayBuffer());
    await POST(requestWithFile(file));

    expect(mocks.uploadData).toHaveBeenCalledTimes(1);
    const [uploadedBuffer, options] = mocks.uploadData.mock.calls[0];
    expect(Buffer.from(uploadedBuffer)).toEqual(Buffer.from(expectedBytes));
    expect(options).toEqual({
      blobHTTPHeaders: { blobContentType: "image/jpeg" },
      abortSignal: expect.any(AbortSignal),
    });
  });

  it("returns an attachment with a generated blobName, the original fileName, fileType, and an uploadedAt timestamp", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithFile(validFile("image/jpeg", "my receipt.jpg")));
    const body = await response.json();
    expect(body.attachment).toMatchObject({ fileName: "my receipt.jpg", fileType: "image/jpeg" });
    expect(typeof body.attachment.blobName).toBe("string");
    expect(new Date(body.attachment.uploadedAt).toString()).not.toBe("Invalid Date");
  });

  // The blob name itself must carry no information - not derived from
  // the filename or the user's email, same trust model as share-link
  // tokens elsewhere in this app.
  it("generates an unguessable blob name unrelated to the original filename", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithFile(validFile("image/jpeg", "my-super-secret-receipt.jpg")));
    const body = await response.json();
    expect(body.attachment.blobName.toLowerCase()).not.toContain("secret");
    expect(body.attachment.blobName.toLowerCase()).not.toContain("owner");
  });

  it("rejects a file whose bytes don't match its declared type", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const mislabelled = new File([new Uint8Array([1, 2, 3, 4])], "fake.jpg", { type: "image/jpeg" });
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