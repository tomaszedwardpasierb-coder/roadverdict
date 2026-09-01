import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── notifications GET ─────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getNotificationsForUser: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/tracker/notification", () => ({
  getNotificationsForUser: mocks.getNotificationsForUser,
  getUnreadNotificationCount: mocks.getUnreadNotificationCount,
  markNotificationRead: mocks.markNotificationRead,
  markAllNotificationsRead: mocks.markAllNotificationsRead,
}));

import { GET } from "@/app/api/tracker/notifications/route";
import { POST } from "@/app/api/tracker/notifications/mark-read/route";

function markReadRequest(body?: object): NextRequest {
  return new NextRequest("http://localhost/api/tracker/notifications/mark-read", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function emptyMarkReadRequest(): NextRequest {
  return new NextRequest("http://localhost/api/tracker/notifications/mark-read", {
    method: "POST",
  });
}

const notifications = [
  { id: "n1", title: "Welcome", body: "Hello", createdAt: "2025-01-01T00:00:00.000Z" },
];

describe("GET /api/tracker/notifications", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.getNotificationsForUser.mockResolvedValue(notifications);
    mocks.getUnreadNotificationCount.mockResolvedValue(1);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.getNotificationsForUser).not.toHaveBeenCalled();
  });

  it("returns notifications and unreadCount for an authenticated user", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      notifications,
      unreadCount: 1,
    });
  });

  it("calls getNotificationsForUser and getUnreadNotificationCount with the session email", async () => {
    await GET();
    expect(mocks.getNotificationsForUser).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.getUnreadNotificationCount).toHaveBeenCalledWith("rider@example.com");
  });

  it("returns an empty list and zero count when there are no notifications", async () => {
    mocks.getNotificationsForUser.mockResolvedValue([]);
    mocks.getUnreadNotificationCount.mockResolvedValue(0);
    const response = await GET();
    await expect(response.json()).resolves.toEqual({ notifications: [], unreadCount: 0 });
  });
});

describe("POST /api/tracker/notifications/mark-read", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
    mocks.markNotificationRead.mockResolvedValue(undefined);
    mocks.markAllNotificationsRead.mockResolvedValue(undefined);
  });

  it("rejects unauthenticated requests", async () => {
    mocks.getSession.mockResolvedValue(null);
    const response = await POST(markReadRequest({ id: "n1" }));
    expect(response.status).toBe(401);
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
    expect(mocks.markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("marks a single notification read when a specific id is provided", async () => {
    const response = await POST(markReadRequest({ id: "n1" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.markNotificationRead).toHaveBeenCalledWith("n1", "rider@example.com");
    expect(mocks.markAllNotificationsRead).not.toHaveBeenCalled();
  });

  it("marks all notifications read when no id is provided in the body", async () => {
    const response = await POST(markReadRequest({}));
    expect(response.status).toBe(200);
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it("marks all notifications read when the request has no body at all", async () => {
    const response = await POST(emptyMarkReadRequest());
    expect(response.status).toBe(200);
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it("ignores a non-string id field and falls back to mark-all", async () => {
    // A numeric id should not be treated as a valid id string
    const response = await POST(markReadRequest({ id: 42 }));
    expect(response.status).toBe(200);
    expect(mocks.markAllNotificationsRead).toHaveBeenCalledWith("rider@example.com");
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });
});
