import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  deleteAssistantQuestion: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
// deleteAssistantQuestion is already covered by its own unit tests
// (tests/unit/assistantQuestionLog.test.ts) - mocked here so this stays
// focused on the route's own auth-gating.
vi.mock("@/lib/tracker/assistantQuestionLog", () => ({ deleteAssistantQuestion: mocks.deleteAssistantQuestion }));

import { DELETE } from "@/app/api/tomasz/assistant-questions/[id]/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/assistant-questions/q1", { method: "DELETE" });
}

describe("DELETE /api/tomasz/assistant-questions/[id]", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.deleteAssistantQuestion.mockResolvedValue(undefined);
  });

  it("rejects a request with no admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await DELETE(request(), { params: { id: "q1" } });
    expect(response.status).toBe(401);
    expect(mocks.deleteAssistantQuestion).not.toHaveBeenCalled();
  });

  it("deletes the given question id for an admin session", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    const response = await DELETE(request(), { params: { id: "q1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteAssistantQuestion).toHaveBeenCalledWith("q1");
  });

  it("returns 500 without leaking internals when the underlying delete throws", async () => {
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.deleteAssistantQuestion.mockRejectedValue(new Error("cosmos unavailable"));
    const response = await DELETE(request(), { params: { id: "q1" } });
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not delete." });
  });
});
