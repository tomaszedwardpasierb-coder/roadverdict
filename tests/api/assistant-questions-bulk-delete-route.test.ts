import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  deleteAssistantQuestions: vi.fn(),
}));

vi.mock("@/lib/admin/session", () => ({ getAdminSession: mocks.getAdminSession }));
vi.mock("@/lib/tracker/assistantQuestionLog", () => ({ deleteAssistantQuestions: mocks.deleteAssistantQuestions }));

import { DELETE } from "@/app/api/tomasz/assistant-questions/route";

function request(body: string): NextRequest {
  return new NextRequest("http://localhost/api/tomasz/assistant-questions", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("DELETE /api/tomasz/assistant-questions", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.getAdminSession.mockResolvedValue(true);
    mocks.deleteAssistantQuestions.mockResolvedValue(2);
  });

  it("rejects a non-admin request", async () => {
    mocks.getAdminSession.mockResolvedValue(false);
    const response = await DELETE(request(JSON.stringify({ ids: ["a", "b"] })));
    expect(response.status).toBe(401);
    expect(mocks.deleteAssistantQuestions).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const response = await DELETE(request("not-json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing ids array", async () => {
    const response = await DELETE(request(JSON.stringify({})));
    expect(response.status).toBe(400);
    expect(mocks.deleteAssistantQuestions).not.toHaveBeenCalled();
  });

  it("rejects an empty ids array", async () => {
    const response = await DELETE(request(JSON.stringify({ ids: [] })));
    expect(response.status).toBe(400);
    expect(mocks.deleteAssistantQuestions).not.toHaveBeenCalled();
  });

  it("deletes the given ids and reports how many were actually removed", async () => {
    const response = await DELETE(request(JSON.stringify({ ids: ["a", "b"] })));
    expect(response.status).toBe(200);
    expect(mocks.deleteAssistantQuestions).toHaveBeenCalledWith(["a", "b"]);
    await expect(response.json()).resolves.toEqual({ ok: true, deletedCount: 2 });
  });

  it("returns 500 when the delete function throws", async () => {
    mocks.deleteAssistantQuestions.mockRejectedValue(new Error("boom"));
    const response = await DELETE(request(JSON.stringify({ ids: ["a"] })));
    expect(response.status).toBe(500);
  });
});
