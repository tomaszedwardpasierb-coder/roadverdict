import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), listTrustedDevices: vi.fn(), removeTrustedDevice: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/auth/trustedDevice", () => ({ listTrustedDevices: mocks.listTrustedDevices, removeTrustedDevice: mocks.removeTrustedDevice }));

import { GET } from "@/app/api/account/trusted-devices/route";
import { DELETE } from "@/app/api/account/trusted-devices/[id]/route";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  Object.values(mocks).forEach((m) => m.mockReset());
  mocks.getSession.mockResolvedValue({ email: "rider@example.com" });
});

describe("trusted phones in Settings", () => {
  it("lists the signed-in owner's own phones, never cached", async () => {
    mocks.listTrustedDevices.mockResolvedValue([{ id: "dev-1", name: "Pixel 7", createdAt: "x", lastUsedAt: null }]);
    const res = await GET();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).devices).toHaveLength(1);
    expect(mocks.listTrustedDevices).toHaveBeenCalledWith("rider@example.com");
  });

  it("removes one of the owner's own phones", async () => {
    mocks.removeTrustedDevice.mockResolvedValue(true);
    const res = await DELETE(new Request("http://localhost"), params("dev-1"));
    expect(res.status).toBe(200);
    expect(mocks.removeTrustedDevice).toHaveBeenCalledWith("rider@example.com", "dev-1");
  });

  it("answers 404 for a phone that is not theirs", async () => {
    mocks.removeTrustedDevice.mockResolvedValue(false);
    expect((await DELETE(new Request("http://localhost"), params("someone-elses"))).status).toBe(404);
  });

  it("refuses anyone not signed in", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await DELETE(new Request("http://localhost"), params("dev-1"))).status).toBe(401);
    expect(mocks.removeTrustedDevice).not.toHaveBeenCalled();
  });
});
