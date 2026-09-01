import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  query: vi.fn(),
  item: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: {
      create: mocks.create,
      query: mocks.query,
    },
    item: mocks.item,
  }),
}));

import {
  createBroadcastNotifications,
  getAllUserEmails,
  getNotificationsForUser,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/tracker/notification";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.create.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
  mocks.item.mockReturnValue({ patch: mocks.patch });
  mocks.patch.mockResolvedValue(undefined);
});

describe("createBroadcastNotifications", () => {
  it("creates one document per recipient email", async () => {
    await createBroadcastNotifications(
      ["a@example.com", "b@example.com", "c@example.com"],
      { title: "Hello", body: "World" }
    );
    expect(mocks.create).toHaveBeenCalledTimes(3);
  });

  it("stores the correct title, body, type, and kind on each document", async () => {
    await createBroadcastNotifications(["a@example.com"], { title: "Test title", body: "Test body" });
    const doc = mocks.create.mock.calls[0][0];
    expect(doc).toMatchObject({
      type: "notification",
      kind: "broadcast",
      title: "Test title",
      body: "Test body",
      pk: "a@example.com",
    });
  });

  it("partitions each document by its recipient email (pk = email)", async () => {
    await createBroadcastNotifications(["x@example.com", "y@example.com"], { title: "T", body: "B" });
    const pks = mocks.create.mock.calls.map((c: any[]) => c[0].pk);
    expect(pks).toContain("x@example.com");
    expect(pks).toContain("y@example.com");
  });

  it("stores linkTo when provided", async () => {
    await createBroadcastNotifications(["a@example.com"], { title: "T", body: "B", linkTo: "/garage" });
    expect(mocks.create.mock.calls[0][0].linkTo).toBe("/garage");
  });

  it("does nothing when the recipient list is empty", async () => {
    await createBroadcastNotifications([], { title: "T", body: "B" });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  // Best-effort: one failed write should not prevent the rest
  it("still resolves when one recipient's create fails", async () => {
    mocks.create
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("write failed"))
      .mockResolvedValueOnce(undefined);
    await expect(
      createBroadcastNotifications(["a@example.com", "b@example.com", "c@example.com"], { title: "T", body: "B" })
    ).resolves.toBeUndefined();
  });

  it("does not include readAt in freshly created documents", async () => {
    await createBroadcastNotifications(["a@example.com"], { title: "T", body: "B" });
    const doc = mocks.create.mock.calls[0][0];
    expect(doc.readAt).toBeUndefined();
  });
});

describe("getAllUserEmails", () => {
  it("returns email strings from the query results", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ email: "a@example.com" }, { email: "b@example.com" }] }),
    });
    const result = await getAllUserEmails();
    expect(result).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns an empty array when there are no users", async () => {
    const result = await getAllUserEmails();
    expect(result).toEqual([]);
  });
});

describe("getNotificationsForUser", () => {
  it("returns the notifications from the query", async () => {
    const notifications = [
      { id: "n1", title: "Hi", body: "Hello", createdAt: "2025-01-01T00:00:00.000Z" },
    ];
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: notifications }) });
    const result = await getNotificationsForUser("rider@example.com");
    expect(result).toEqual(notifications);
  });

  it("returns an empty array when there are no notifications", async () => {
    const result = await getNotificationsForUser("rider@example.com");
    expect(result).toEqual([]);
  });
});

describe("getUnreadNotificationCount", () => {
  it("returns the count from the query result", async () => {
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [5] }) });
    const result = await getUnreadNotificationCount("rider@example.com");
    expect(result).toBe(5);
  });

  it("returns 0 when the query returns no rows", async () => {
    // Cosmos COUNT query returns empty array when partition has no documents
    mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: [] }) });
    const result = await getUnreadNotificationCount("rider@example.com");
    expect(result).toBe(0);
  });
});

describe("markNotificationRead", () => {
  it("patches the correct notification with a readAt timestamp", async () => {
    await markNotificationRead("n1", "rider@example.com");
    expect(mocks.item).toHaveBeenCalledWith("n1", "rider@example.com");
    expect(mocks.patch).toHaveBeenCalledWith([
      expect.objectContaining({ op: "add", path: "/readAt" }),
    ]);
  });

  it("uses the current time as the readAt value", async () => {
    const before = Date.now();
    await markNotificationRead("n1", "rider@example.com");
    const after = Date.now();
    const patchedValue = mocks.patch.mock.calls[0][0][0].value;
    const ts = new Date(patchedValue).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

describe("markAllNotificationsRead", () => {
  it("patches every unread notification", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ id: "n1" }, { id: "n2" }] }),
    });
    await markAllNotificationsRead("rider@example.com");
    expect(mocks.patch).toHaveBeenCalledTimes(2);
  });

  it("does nothing when there are no unread notifications", async () => {
    await markAllNotificationsRead("rider@example.com");
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  // Best-effort: one failed patch should not prevent the rest
  it("still resolves when one patch fails", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ id: "n1" }, { id: "n2" }] }),
    });
    mocks.patch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("patch failed"));
    await expect(markAllNotificationsRead("rider@example.com")).resolves.toBeUndefined();
  });

  it("uses the same timestamp for all patches in a single call", async () => {
    mocks.query.mockReturnValue({
      fetchAll: () => Promise.resolve({ resources: [{ id: "n1" }, { id: "n2" }, { id: "n3" }] }),
    });
    await markAllNotificationsRead("rider@example.com");
    const timestamps = mocks.patch.mock.calls.map((c: any[]) => c[0][0].value);
    expect(new Set(timestamps).size).toBe(1);
  });
});
