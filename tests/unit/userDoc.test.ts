import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ item: () => ({ read: mocks.read }) }),
}));

import { getUserDoc, isAccountBlocked } from "@/lib/tracker/userDoc";

describe("getUserDoc", () => {
  beforeEach(() => mocks.read.mockReset());

  it("returns the user doc when it exists", async () => {
    mocks.read.mockResolvedValue({ resource: { id: "rider@example.com", email: "rider@example.com", type: "user" } });
    await expect(getUserDoc("rider@example.com")).resolves.toEqual({
      id: "rider@example.com", email: "rider@example.com", type: "user",
    });
  });

  it("returns null when no user doc exists", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(getUserDoc("nobody@example.com")).resolves.toBeNull();
  });
});

describe("isAccountBlocked", () => {
  beforeEach(() => mocks.read.mockReset());

  it("returns false when there's no user doc at all", async () => {
    mocks.read.mockResolvedValue({ resource: undefined });
    await expect(isAccountBlocked("nobody@example.com")).resolves.toBe(false);
  });

  it("returns false when the user doc exists but isn't blocked", async () => {
    mocks.read.mockResolvedValue({ resource: { email: "rider@example.com" } });
    await expect(isAccountBlocked("rider@example.com")).resolves.toBe(false);
  });

  it("returns true when the user doc has blocked: true", async () => {
    mocks.read.mockResolvedValue({ resource: { email: "rider@example.com", blocked: true } });
    await expect(isAccountBlocked("rider@example.com")).resolves.toBe(true);
  });
});
