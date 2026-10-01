import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  setVehicleAllowance: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/userAccount", () => ({ setVehicleAllowance: mocks.setVehicleAllowance }));

import { POST } from "@/app/api/tomasz/accounts/vehicle-allowance/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/accounts/vehicle-allowance", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/accounts/vehicle-allowance", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.setVehicleAllowance.mockResolvedValue(undefined);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", allowance: 4 })));
    expect(response.status).toBe(401);
    expect(mocks.setVehicleAllowance).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON, a missing email and a non-number allowance", async () => {
    expect((await POST(request("not-json"))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ allowance: 3 })))).status).toBe(400);
    expect((await POST(request(JSON.stringify({ email: "rider@example.com", allowance: "4" })))).status).toBe(400);
    expect(mocks.setVehicleAllowance).not.toHaveBeenCalled();
  });

  it("sets the allowance on the normalized email", async () => {
    const response = await POST(request(JSON.stringify({ email: "  Rider@Example.com ", allowance: 3 })));
    expect(response.status).toBe(200);
    expect(mocks.setVehicleAllowance).toHaveBeenCalledWith("rider@example.com", 3);
  });

  it("clears the allowance with null", async () => {
    await POST(request(JSON.stringify({ email: "rider@example.com", allowance: null })));
    expect(mocks.setVehicleAllowance).toHaveBeenCalledWith("rider@example.com", null);
  });

  it("passes on the library's own range error", async () => {
    mocks.setVehicleAllowance.mockRejectedValue(new Error("The allowance must be a whole number from 2 to 4."));
    const response = await POST(request(JSON.stringify({ email: "rider@example.com", allowance: 9 })));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "The allowance must be a whole number from 2 to 4." });
  });
});
