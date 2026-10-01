import { beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";

const mocks = vi.hoisted(() => ({ getProperties: vi.fn(), download: vi.fn(), ownsAttachment: vi.fn() }));

vi.mock("@/lib/blobStorage", () => ({
  getAttachmentContainer: async () => ({ getBlockBlobClient: () => ({ getProperties: mocks.getProperties, download: mocks.download }) }),
}));
vi.mock("@/lib/tracker/attachmentOwnership", () => ({ ownsAttachment: mocks.ownsAttachment }));

import { attachmentOwnerHash, loadAttachmentForAi } from "@/lib/tracker/chatAttachment";

const EMAIL = "rider@example.com";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.download.mockResolvedValue({ readableStreamBody: Readable.from([Buffer.from("jpeg-bytes")]) });
  mocks.ownsAttachment.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadAttachmentForAi", () => {
  it("reads a file this account uploaded for the chat", async () => {
    mocks.getProperties.mockResolvedValue({ contentType: "image/jpeg", contentLength: 10, metadata: { ownerhash: attachmentOwnerHash(EMAIL) } });
    expect(await loadAttachmentForAi(EMAIL, "blob.jpg")).toEqual({ mimeType: "image/jpeg", base64: Buffer.from("jpeg-bytes").toString("base64") });
  });

  it("reads a file already on one of this account's records", async () => {
    mocks.getProperties.mockResolvedValue({ contentType: "application/pdf", contentLength: 10, metadata: {} });
    mocks.ownsAttachment.mockResolvedValue(true);
    expect(await loadAttachmentForAi(EMAIL, "blob.pdf")).toMatchObject({ mimeType: "application/pdf" });
  });

  it("never reads someone else's file", async () => {
    mocks.getProperties.mockResolvedValue({ contentType: "image/jpeg", contentLength: 10, metadata: { ownerhash: attachmentOwnerHash("someone-else@example.com") } });
    expect(await loadAttachmentForAi(EMAIL, "blob.jpg")).toBeNull();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("skips anything too big or of a kind the AI can't read, and survives a storage error", async () => {
    mocks.getProperties.mockResolvedValue({ contentType: "image/jpeg", contentLength: 11 * 1024 * 1024, metadata: { ownerhash: attachmentOwnerHash(EMAIL) } });
    expect(await loadAttachmentForAi(EMAIL, "big.jpg")).toBeNull();
    mocks.getProperties.mockResolvedValue({ contentType: "text/html", contentLength: 10, metadata: { ownerhash: attachmentOwnerHash(EMAIL) } });
    expect(await loadAttachmentForAi(EMAIL, "page.html")).toBeNull();
    mocks.getProperties.mockRejectedValue(new Error("storage down"));
    expect(await loadAttachmentForAi(EMAIL, "blob.jpg")).toBeNull();
  });

  it("hashes the email case-insensitively", () => {
    expect(attachmentOwnerHash("Rider@Example.com ")).toBe(attachmentOwnerHash(EMAIL));
  });
});
