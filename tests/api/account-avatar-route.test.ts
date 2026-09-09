import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getUserDoc: vi.fn(),
  updateProfile: vi.fn(),
  getAttachmentContainer: vi.fn(),
  uploadData: vi.fn(),
  deleteIfExists: vi.fn(),
  download: vi.fn(),
  sharpToBuffer: vi.fn(),
}));

vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({
      resize: () => ({
        jpeg: () => ({ toBuffer: mocks.sharpToBuffer }),
      }),
    }),
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/userDoc", () => ({ getUserDoc: mocks.getUserDoc }));
vi.mock("@/lib/tracker/userAccount", () => ({ updateProfile: mocks.updateProfile }));
vi.mock("@/lib/blobStorage", () => ({ getAttachmentContainer: mocks.getAttachmentContainer }));

import { POST, GET, DELETE } from "@/app/api/account/avatar/route";

function requestWithFile(file: File): NextRequest {
  const fd = new FormData();
  fd.set("file", file);
  return new NextRequest("http://localhost/api/account/avatar", { method: "POST", body: fd });
}

describe("/api/account/avatar", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.getUserDoc.mockResolvedValue({});
    mocks.updateProfile.mockResolvedValue(undefined);
    mocks.sharpToBuffer.mockResolvedValue(Buffer.from([1, 2, 3]));
    mocks.deleteIfExists.mockResolvedValue(undefined);
    mocks.getAttachmentContainer.mockResolvedValue({
      getBlockBlobClient: () => ({
        uploadData: mocks.uploadData,
        deleteIfExists: mocks.deleteIfExists,
        download: mocks.download,
      }),
    });
  });

  describe("POST", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.getSession.mockResolvedValue(null);
      const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
      expect(response.status).toBe(401);
    });

    it("rejects a disallowed file type", async () => {
      const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.pdf", { type: "application/pdf" })));
      expect(response.status).toBe(400);
      expect(mocks.sharpToBuffer).not.toHaveBeenCalled();
    });

    it("rejects a file over the 2MB cap", async () => {
      const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "a.jpg", { type: "image/jpeg" });
      const response = await POST(requestWithFile(big));
      expect(response.status).toBe(400);
    });

    it("resizes the uploaded image before storing it, and saves the new blobName on the user's own profile", async () => {
      const response = await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
      expect(response.status).toBe(200);
      expect(mocks.sharpToBuffer).toHaveBeenCalled();
      expect(mocks.uploadData).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), { blobHTTPHeaders: { blobContentType: "image/jpeg" } });
      expect(mocks.updateProfile).toHaveBeenCalledWith("rider@example.com", { avatarBlobName: expect.any(String) });
    });

    it("deletes the previous avatar blob after a new one replaces it", async () => {
      mocks.getUserDoc.mockResolvedValue({ avatarBlobName: "avatar-old.jpg" });
      await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
      expect(mocks.deleteIfExists).toHaveBeenCalled();
    });

    it("doesn't attempt to delete anything when there was no previous avatar", async () => {
      mocks.getUserDoc.mockResolvedValue({});
      await POST(requestWithFile(new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" })));
      expect(mocks.deleteIfExists).not.toHaveBeenCalled();
    });
  });

  describe("GET", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.getSession.mockResolvedValue(null);
      const response = await GET();
      expect(response.status).toBe(401);
    });

    it("404s when the account has no avatar set", async () => {
      mocks.getUserDoc.mockResolvedValue({});
      const response = await GET();
      expect(response.status).toBe(404);
    });

    it("streams back the signed-in caller's own avatar blob", async () => {
      mocks.getUserDoc.mockResolvedValue({ avatarBlobName: "avatar-mine.jpg" });
      mocks.download.mockResolvedValue({ contentType: "image/jpeg", readableStreamBody: (async function* () { yield Buffer.from([9, 9]); })() });
      const response = await GET();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
    });
  });

  describe("DELETE", () => {
    it("rejects unauthenticated requests", async () => {
      mocks.getSession.mockResolvedValue(null);
      const response = await DELETE();
      expect(response.status).toBe(401);
    });

    it("clears the stored avatarBlobName and deletes the blob", async () => {
      mocks.getUserDoc.mockResolvedValue({ avatarBlobName: "avatar-mine.jpg" });
      const response = await DELETE();
      expect(response.status).toBe(200);
      expect(mocks.deleteIfExists).toHaveBeenCalled();
      expect(mocks.updateProfile).toHaveBeenCalledWith("rider@example.com", { avatarBlobName: null });
    });

    it("is a no-op delete-wise when there was never an avatar, but still clears the field", async () => {
      mocks.getUserDoc.mockResolvedValue({});
      const response = await DELETE();
      expect(response.status).toBe(200);
      expect(mocks.deleteIfExists).not.toHaveBeenCalled();
      expect(mocks.updateProfile).toHaveBeenCalledWith("rider@example.com", { avatarBlobName: null });
    });
  });
});
