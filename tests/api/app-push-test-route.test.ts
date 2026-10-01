import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), getPushTokens: vi.fn(), sendPushToUser: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/push/pushTokens", () => ({ getPushTokens: mocks.getPushTokens }));
vi.mock("@/lib/push/sendPush", () => ({ sendPushToUser: mocks.sendPushToUser }));

import { POST } from "@/app/api/app/push-test/route";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("POST /api/app/push-test", () => {
  it("sends a test to the owner's own phones and says how it went", async () => {
    mocks.getPushTokens.mockResolvedValue(["ExponentPushToken[aaaaaaaaaaaa]"]);
    mocks.sendPushToUser.mockResolvedValue(1);
    const res = await POST();
    expect(await res.json()).toEqual({ registered: 1, sent: 1 });
    expect(mocks.sendPushToUser).toHaveBeenCalledWith("rider@example.com", expect.objectContaining({ url: "/notifications" }));
  });

  it("tells a phone that never registered apart from a failed send", async () => {
    mocks.getPushTokens.mockResolvedValue([]);
    expect(await (await POST()).json()).toEqual({ registered: 0, sent: 0 });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST()).status).toBe(401);
  });
});
