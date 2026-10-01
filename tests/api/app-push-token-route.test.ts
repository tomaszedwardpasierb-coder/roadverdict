import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), savePushToken: vi.fn(), removePushToken: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/push/pushTokens", async () => {
  const actual = await vi.importActual<typeof import("@/lib/push/pushTokens")>("@/lib/push/pushTokens");
  return { isExpoPushToken: actual.isExpoPushToken, savePushToken: mocks.savePushToken, removePushToken: mocks.removePushToken };
});

import { DELETE, POST } from "@/app/api/app/push-token/route";

const TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxx]";
const req = (method: string, body: unknown) =>
  new NextRequest("http://localhost/api/app/push-token", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("/api/app/push-token", () => {
  it("registers the signed-in owner's phone", async () => {
    const res = await POST(req("POST", { token: TOKEN, deviceName: "Pixel 7" }));
    expect(res.status).toBe(200);
    expect(mocks.savePushToken).toHaveBeenCalledWith("rider@example.com", TOKEN, "Pixel 7");
  });

  it("refuses anything that isn't an Expo push token", async () => {
    expect((await POST(req("POST", { token: "not-a-token" }))).status).toBe(400);
    expect((await POST(req("POST", { token: 42 }))).status).toBe(400);
    expect(mocks.savePushToken).not.toHaveBeenCalled();
  });

  it("removes the phone on sign-out", async () => {
    const res = await DELETE(req("DELETE", { token: TOKEN }));
    expect(res.status).toBe(200);
    expect(mocks.removePushToken).toHaveBeenCalledWith("rider@example.com", TOKEN);
  });

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(req("POST", { token: TOKEN }))).status).toBe(401);
    expect((await DELETE(req("DELETE", { token: TOKEN }))).status).toBe(401);
    expect(mocks.savePushToken).not.toHaveBeenCalled();
  });
});
