import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/session", () => ({ getSession }));

import { POST as postService } from "@/app/api/tracker/services/route";
import { POST as postFuel } from "@/app/api/tracker/fuel/route";
import { PATCH as patchBike } from "@/app/api/tracker/bike/route";

function request(url: string, method: "POST" | "PATCH", body: string): NextRequest {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("core tracker route authentication", () => {
  beforeEach(() => getSession.mockReset());

  it.each([
    ["service", () => postService(request("/api/tracker/services", "POST", "not-json"))],
    ["fuel", () => postFuel(request("/api/tracker/fuel", "POST", "not-json"))],
    ["vehicle update", () => patchBike(request("/api/tracker/bike", "PATCH", "not-json"))],
  ])("rejects an unauthenticated %s request", async (_name, invoke) => {
    getSession.mockResolvedValue(null);

    const response = await invoke();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Not signed in." });
  });

  it("rejects an authenticated vehicle update with no fields", async () => {
    getSession.mockResolvedValue({ email: "owner@example.com" });

    const response = await patchBike(request("/api/tracker/bike", "PATCH", "{}"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Nothing to update." });
  });
});