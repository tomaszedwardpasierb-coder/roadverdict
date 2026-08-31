import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getAttachmentContainer: vi.fn(),
  uploadData: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));

import { POST } from "@/app/api/tracker/upload-attachment/route";

function requestWithFile(file: File): NextRequest {
  const fd = new FormData();
  fd.set("file", file);
  return new NextRequest("http://localhost/api/tracker/upload-attachment", { method: "POST", body: fd });
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
    const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
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

    const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.dat", { type })));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.attachment.blobName).toMatch(new RegExp(`\\.${ext}$`));
    expect(getBlockBlobClient).toHaveBeenCalledWith(body.attachment.blobName);
  });

  it("rejects a file larger than the 10MB cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "a.jpg", { type: "image/jpeg" });
    const response = await POST(requestWithFile(big));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "File is too large - 10MB maximum." });
    expect(mocks.getAttachmentContainer).not.toHaveBeenCalled();
  });

  it("allows a file exactly at the 10MB cap", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const exact = new File([new Uint8Array(10 * 1024 * 1024)], "a.jpg", { type: "image/jpeg" });
    const response = await POST(requestWithFile(exact));
    expect(response.status).toBe(200);
  });

  it("uploads the file's real bytes with its content type set as blobHTTPHeaders", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const bytes = new Uint8Array([10, 20, 30]);
    await POST(requestWithFile(new File([bytes], "a.jpg", { type: "image/jpeg" })));

    expect(mocks.uploadData).toHaveBeenCalledTimes(1);
    const [uploadedBuffer, options] = mocks.uploadData.mock.calls[0];
    expect(Buffer.from(uploadedBuffer)).toEqual(Buffer.from(bytes));
    expect(options).toEqual({ blobHTTPHeaders: { blobContentType: "image/jpeg" } });
  });

  it("returns an attachment with a generated blobName, the original fileName, fileType, and an uploadedAt timestamp", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    const response = await POST(requestWithFile(new File([new Uint8Array([1])], "my receipt.jpg", { type: "image/jpeg" })));
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
    const response = await POST(requestWithFile(new File([new Uint8Array([1])], "my-super-secret-receipt.jpg", { type: "image/jpeg" })));
    const body = await response.json();
    expect(body.attachment.blobName.toLowerCase()).not.toContain("secret");
    expect(body.attachment.blobName.toLowerCase()).not.toContain("owner");
  });

  it("responds 500 with the error detail when the upload itself fails", async () => {
    mocks.getSession.mockResolvedValue({ email: "owner@example.com" });
    mocks.uploadData.mockRejectedValue(new Error("storage account unavailable"));
    const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Upload failed. Please try again.",
      detail: "storage account unavailable",
    });
  });
});