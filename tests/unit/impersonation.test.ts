import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
  deleteFn: vi.fn(),
}));

const mockContainer = {
  items: {
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
    create: mocks.create,
    upsert: mocks.upsert,
  },
  item: vi.fn(() => ({ delete: mocks.deleteFn })),
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import {
  userExists,
  logImpersonation,
  newImpersonationSessionId,
  getAllImpersonationSessions,
  logImpersonationActivity,
  countImpersonationActivity,
  purgeOldImpersonationLogs,
} from "@/lib/admin/impersonation";

beforeEach(() => {
  mocks.fetchAll.mockReset();
  mocks.create.mockReset();
  mocks.upsert.mockReset();
  mocks.deleteFn.mockReset();
  mocks.upsert.mockResolvedValue(undefined);
  mocks.create.mockResolvedValue(undefined);
  mocks.deleteFn.mockResolvedValue(undefined);
  mockContainer.items.query.mockClear();
});

describe("userExists", () => {
  it("returns true when the account has at least one qualifying doc (user/session/bike)", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [1] });
    expect(await userExists("rider@example.com")).toBe(true);
  });

  it("returns false when the count comes back zero", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [0] });
    expect(await userExists("nobody@example.com")).toBe(false);
  });

  it("queries by pk = email and matches type in (user, session, bike)", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [1] });
    await userExists("rider@example.com");
    const [query] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.pk = @email");
    expect(query.query).toContain("c.type = 'user'");
    expect(query.query).toContain("c.type = 'session'");
    expect(query.query).toContain("c.type = 'bike'");
    expect(query.parameters).toEqual([{ name: "@email", value: "rider@example.com" }]);
  });

  it("fails soft to false if the query itself throws", async () => {
    mocks.fetchAll.mockRejectedValue(new Error("cosmos unavailable"));
    expect(await userExists("rider@example.com")).toBe(false);
  });
});

describe("newImpersonationSessionId", () => {
  it("generates a unique, prefixed id each call", () => {
    const a = newImpersonationSessionId();
    const b = newImpersonationSessionId();
    expect(a).toMatch(/^impersonation-/);
    expect(b).toMatch(/^impersonation-/);
    expect(a).not.toBe(b);
  });
});

describe("logImpersonation", () => {
  it("upserts a doc with the admin partition, type, target email, action, sessionId and ip", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "start", "session-1", "checking a support ticket");

    expect(mocks.upsert).toHaveBeenCalledOnce();
    const doc = mocks.upsert.mock.calls[0][0];
    expect(doc).toMatchObject({
      pk: "admin",
      type: "adminImpersonation",
      targetEmail: "target@example.com",
      action: "start",
      sessionId: "session-1",
      reason: "checking a support ticket",
      ip: "1.2.3.4",
    });
  });

  it("uses a deterministic id (sessionId + action) so a duplicate call is a safe idempotent upsert, not a conflict", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "start", "session-1");
    await logImpersonation("target@example.com", "1.2.3.4", "end", "session-1");

    const [firstDoc] = mocks.upsert.mock.calls[0];
    const [secondDoc] = mocks.upsert.mock.calls[1];
    expect(firstDoc.id).toBe("session-1::start");
    expect(secondDoc.id).toBe("session-1::end");
  });

  it("omits reason entirely (not even null) when none is given", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "end", "session-1");
    expect(mocks.upsert.mock.calls[0][0]).not.toHaveProperty("reason");
  });

  it("records a current ISO timestamp in `at`", async () => {
    const before = Date.now();
    await logImpersonation("target@example.com", "1.2.3.4", "end", "session-1");
    const after = Date.now();

    const doc = mocks.upsert.mock.calls[0][0];
    const at = new Date(doc.at).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });
});

describe("getAllImpersonationSessions", () => {
  it("pairs a start and its matching end (by sessionId) into one session row, with a computed duration", async () => {
    const startedAt = "2026-01-01T00:00:00.000Z";
    const endedAt = "2026-01-01T00:15:00.000Z";
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { sessionId: "s1", targetEmail: "rider@example.com", action: "start", at: startedAt, ip: "1.2.3.4", reason: "support" },
        { sessionId: "s1", targetEmail: "rider@example.com", action: "end", at: endedAt, ip: "1.2.3.4" },
      ],
    });

    const sessions = await getAllImpersonationSessions();

    expect(sessions).toEqual([
      { sessionId: "s1", targetEmail: "rider@example.com", reason: "support", startedAt, endedAt, durationMinutes: 15, ip: "1.2.3.4" },
    ]);
  });

  it("shows a null endedAt/durationMinutes for a session with no matching end event yet (still active or abandoned)", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [{ sessionId: "s1", targetEmail: "rider@example.com", action: "start", at: "2026-01-01T00:00:00.000Z", ip: "1.2.3.4" }],
    });

    const sessions = await getAllImpersonationSessions();

    expect(sessions[0].endedAt).toBeNull();
    expect(sessions[0].durationMinutes).toBeNull();
  });

  it("defaults reason to null when the start event never recorded one", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [{ sessionId: "s1", targetEmail: "rider@example.com", action: "start", at: "2026-01-01T00:00:00.000Z", ip: "1.2.3.4" }],
    });
    const sessions = await getAllImpersonationSessions();
    expect(sessions[0].reason).toBeNull();
  });

  it("ignores an end event with no matching start (nothing a real session ever produced)", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [{ sessionId: "orphan", targetEmail: "rider@example.com", action: "end", at: "2026-01-01T00:00:00.000Z", ip: "1.2.3.4" }],
    });
    expect(await getAllImpersonationSessions()).toEqual([]);
  });

  it("sorts sessions newest-first", async () => {
    mocks.fetchAll.mockResolvedValue({
      resources: [
        { sessionId: "old", targetEmail: "a@example.com", action: "start", at: "2025-01-01T00:00:00.000Z", ip: "1.2.3.4" },
        { sessionId: "new", targetEmail: "b@example.com", action: "start", at: "2026-01-01T00:00:00.000Z", ip: "1.2.3.4" },
      ],
    });
    const sessions = await getAllImpersonationSessions();
    expect(sessions.map((s) => s.sessionId)).toEqual(["new", "old"]);
  });
});

describe("logImpersonationActivity / countImpersonationActivity", () => {
  it("creates an impersonationActivity doc with the given fields", async () => {
    await logImpersonationActivity({ sessionId: "s1", targetEmail: "rider@example.com", docType: "bill", docId: "bill-1", action: "create", at: "2026-01-01T00:00:00.000Z" });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.create.mock.calls[0][0]).toMatchObject({
      pk: "admin",
      type: "impersonationActivity",
      sessionId: "s1",
      targetEmail: "rider@example.com",
      docType: "bill",
      docId: "bill-1",
      action: "create",
    });
  });

  it("never throws when the write itself fails - this is a best-effort side log, never allowed to break the real write it describes", async () => {
    mocks.create.mockRejectedValue(new Error("cosmos unavailable"));
    await expect(
      logImpersonationActivity({ sessionId: "s1", targetEmail: "rider@example.com", docType: "bill", docId: "bill-1", action: "create", at: "2026-01-01T00:00:00.000Z" })
    ).resolves.toBeUndefined();
  });

  it("counts activity entries scoped to one sessionId", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [3] });
    expect(await countImpersonationActivity("s1")).toBe(3);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'impersonationActivity'");
    expect(query.query).toContain("c.sessionId = @sessionId");
    expect(query.parameters).toEqual([{ name: "@sessionId", value: "s1" }]);
    expect(options).toEqual({ partitionKey: "admin" });
  });
});

describe("purgeOldImpersonationLogs", () => {
  it("deletes docs matched by the query, scoped to the admin partition", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "impersonation-1" }, { id: "impersonation-2" }] });
    const count = await purgeOldImpersonationLogs();
    expect(mocks.deleteFn).toHaveBeenCalledTimes(2);
    expect(count).toBe(2);
    const [query, options] = mockContainer.items.query.mock.calls.at(-1) as any[];
    expect(query.query).toContain("c.type = 'adminImpersonation'");
    expect(query.query).toContain("c.type = 'impersonationActivity'");
    expect(query.query).toContain("c.at < @cutoff");
    expect(options).toEqual({ partitionKey: "admin" });
  });

  it("is best-effort - one failed delete doesn't stop the rest", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [{ id: "impersonation-1" }, { id: "impersonation-2" }] });
    mocks.deleteFn.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("boom"));
    const count = await purgeOldImpersonationLogs();
    expect(count).toBe(1);
  });

  it("returns 0 when nothing is old enough", async () => {
    mocks.fetchAll.mockResolvedValue({ resources: [] });
    const count = await purgeOldImpersonationLogs();
    expect(count).toBe(0);
    expect(mocks.deleteFn).not.toHaveBeenCalled();
  });
});
