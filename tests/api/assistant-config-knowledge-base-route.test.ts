import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  updateKnowledgeBase: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// updateKnowledgeBase is already covered by its own unit tests
// (tests/unit/assistantConfig.test.ts) - mocked here so this stays
// focused on the route's own auth-gating and input validation.
vi.mock("@/lib/tracker/assistantConfig", () => ({ updateKnowledgeBase: mocks.updateKnowledgeBase }));

import { POST } from "@/app/api/tomasz/assistant-config/knowledge-base/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/assistant-config/knowledge-base", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/tomasz/assistant-config/knowledge-base", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.updateKnowledgeBase.mockResolvedValue(undefined);
  });

  it("rejects a request with no admin session at all", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await POST(request(JSON.stringify({ content: "new knowledge" })));
    expect(response.status).toBe(401);
    expect(mocks.updateKnowledgeBase).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON even when signed in as admin", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request("not-json"));
    expect(response.status).toBe(400);
    expect(mocks.updateKnowledgeBase).not.toHaveBeenCalled();
  });

  it("rejects a missing content field", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.updateKnowledgeBase).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only content", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ content: "   " })));
    expect(response.status).toBe(400);
    expect(mocks.updateKnowledgeBase).not.toHaveBeenCalled();
  });

  it("saves valid content for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await POST(request(JSON.stringify({ content: "new knowledge base text" })));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.updateKnowledgeBase).toHaveBeenCalledWith("new knowledge base text");
  });

  it("returns 500 without leaking internals when the underlying save throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.updateKnowledgeBase.mockRejectedValue(new Error("cosmos unavailable"));
    const response = await POST(request(JSON.stringify({ content: "new knowledge" })));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to save." });
  });
});
