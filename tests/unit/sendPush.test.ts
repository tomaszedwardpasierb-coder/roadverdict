import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPushTokens: vi.fn(), removePushToken: vi.fn() }));
vi.mock("@/lib/push/pushTokens", () => ({ getPushTokens: mocks.getPushTokens, removePushToken: mocks.removePushToken }));

import { sendPushToUser } from "@/lib/push/sendPush";

const EMAIL = "rider@example.com";
const A = "ExponentPushToken[aaaaaaaaaaaa]";
const B = "ExponentPushToken[bbbbbbbbbbbb]";

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendPushToUser", () => {
  it("does nothing for an owner with no phones registered", async () => {
    mocks.getPushTokens.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn());
    expect(await sendPushToUser(EMAIL, { title: "MOT", body: "Due soon" })).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends to every phone with where a tap should go, and drops phones the app has left", async () => {
    mocks.getPushTokens.mockResolvedValue([A, B]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendPushToUser(EMAIL, { title: "MOT", body: "Due soon", url: "/reminders" })).toBe(1);
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toHaveLength(2);
    expect(sent[0]).toMatchObject({ to: A, title: "MOT", body: "Due soon", channelId: "default", data: { url: "/reminders" } });
    expect(mocks.removePushToken).toHaveBeenCalledWith(EMAIL, B);
    expect(mocks.removePushToken).not.toHaveBeenCalledWith(EMAIL, A);
  });

  it("never throws - a failed send just sends nothing", async () => {
    mocks.getPushTokens.mockResolvedValue([A]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await sendPushToUser(EMAIL, { title: "MOT", body: "Due soon" })).toBe(0);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    expect(await sendPushToUser(EMAIL, { title: "MOT", body: "Due soon" })).toBe(0);
    mocks.getPushTokens.mockRejectedValue(new Error("db down"));
    expect(await sendPushToUser(EMAIL, { title: "MOT", body: "Due soon" })).toBe(0);
  });
});
