import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), deleteFn: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { create: mocks.create },
    item: () => ({ delete: mocks.deleteFn }),
  }),
}));

import { acquireVaultUploadLock, releaseVaultUploadLock } from "@/lib/tracker/vaultUploadLock";

describe("acquireVaultUploadLock", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.deleteFn.mockReset();
  });

  it("returns true when the lock doc is created successfully", async () => {
    mocks.create.mockResolvedValue(undefined);
    await expect(acquireVaultUploadLock("owner@example.com", "bike-1")).resolves.toBe(true);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: "vault-upload-lock:bike-1", pk: "owner@example.com", ttl: 30 })
    );
  });

  it("returns false (does not throw) when a concurrent upload already holds the lock", async () => {
    mocks.create.mockRejectedValue(Object.assign(new Error("conflict"), { code: 409 }));
    await expect(acquireVaultUploadLock("owner@example.com", "bike-1")).resolves.toBe(false);
  });

  it("propagates a genuine, non-conflict error", async () => {
    mocks.create.mockRejectedValue(new Error("network down"));
    await expect(acquireVaultUploadLock("owner@example.com", "bike-1")).rejects.toThrow("network down");
  });
});

describe("releaseVaultUploadLock", () => {
  beforeEach(() => {
    mocks.deleteFn.mockReset();
  });

  it("deletes the lock doc", async () => {
    mocks.deleteFn.mockResolvedValue(undefined);
    await releaseVaultUploadLock("owner@example.com", "bike-1");
    expect(mocks.deleteFn).toHaveBeenCalled();
  });

  it("does not throw when the lock is already gone", async () => {
    mocks.deleteFn.mockRejectedValue(new Error("not found"));
    await expect(releaseVaultUploadLock("owner@example.com", "bike-1")).resolves.toBeUndefined();
  });
});
