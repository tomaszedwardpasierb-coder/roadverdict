import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAssistantConfig: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/tracker/assistantConfig", () => ({
  getAssistantConfig: mocks.getAssistantConfig,
}));
vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({ items: { create: mocks.create, upsert: mocks.upsert } }),
}));

import { POST } from "@/app/api/cron/seed-assistant-config/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/seed-assistant-config", { method: "POST", headers });
}

describe("POST /api/cron/seed-assistant-config", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    process.env.CRON_SECRET = "top-secret";
    mocks.getAssistantConfig.mockResolvedValue(null);
    mocks.create.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.getAssistantConfig).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const response = await POST(request({ authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
  });

  it("rejects every request when CRON_SECRET isn't configured", async () => {
    delete process.env.CRON_SECRET;
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(401);
  });

  it("is a no-op, and never writes anything, when the config already exists", async () => {
    mocks.getAssistantConfig.mockResolvedValue({ id: "assistantConfig" });
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, alreadySeeded: true });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("seeds the config, a version snapshot, and a cronStatus doc on first run", async () => {
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true, alreadySeeded: false });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: "assistantConfig", pk: "system", type: "assistantConfig", personalityEnabled: false, activePersonalityId: null,
    }));
    expect(mocks.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      pk: "system", type: "knowledgeBaseVersion",
    }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::seedAssistantConfig", pk: "system", type: "cronStatus",
    }));
  });

  it("returns a 500 with detail when the seed write fails", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Cosmos write failed"));
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Unexpected error seeding assistant config", detail: "Cosmos write failed",
    });
  });
});
