import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAll: vi.fn(),
  create: vi.fn(),
  deleteFn: vi.fn(),
}));

const mockContainer = {
  items: {
    query: vi.fn(() => ({ fetchAll: mocks.fetchAll })),
    create: mocks.create,
  },
  item: vi.fn(() => ({ delete: mocks.deleteFn })),
};

vi.mock("@/lib/cosmos", () => ({ getContainer: () => mockContainer }));

import { userExists, logImpersonation, purgeOldImpersonationLogs } from "@/lib/admin/impersonation";

beforeEach(() => {
  mocks.fetchAll.mockReset();
  mocks.create.mockReset();
  mocks.deleteFn.mockReset();
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

describe("logImpersonation", () => {
  it("creates a doc with the admin partition, type, target email, action and ip", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "start");

    expect(mocks.create).toHaveBeenCalledOnce();
    const doc = mocks.create.mock.calls[0][0];
    expect(doc).toMatchObject({
      pk: "admin",
      type: "adminImpersonation",
      targetEmail: "target@example.com",
      action: "start",
      ip: "1.2.3.4",
    });
  });

  it("generates a unique, prefixed id per call", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "start");
    await logImpersonation("target@example.com", "1.2.3.4", "end");

    const [firstDoc] = mocks.create.mock.calls[0];
    const [secondDoc] = mocks.create.mock.calls[1];
    expect(firstDoc.id).toMatch(/^impersonation-/);
    expect(secondDoc.id).toMatch(/^impersonation-/);
    expect(firstDoc.id).not.toBe(secondDoc.id);
  });

  it("records a current ISO timestamp in `at`", async () => {
    const before = Date.now();
    await logImpersonation("target@example.com", "1.2.3.4", "end");
    const after = Date.now();

    const doc = mocks.create.mock.calls[0][0];
    const at = new Date(doc.at).getTime();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(after);
  });

  it("propagates the 'end' action distinctly from 'start'", async () => {
    await logImpersonation("target@example.com", "1.2.3.4", "end");
    expect(mocks.create.mock.calls[0][0].action).toBe("end");
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
