import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  itemRead: vi.fn(),
  create: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/cosmos", () => ({
  getContainer: () => ({
    items: { query: mocks.query, create: mocks.create, upsert: mocks.upsert },
    item: (id: string) => ({ read: () => mocks.itemRead(id) }),
  }),
}));

import { POST } from "@/app/api/cron/backfill-users/route";

function request(headers?: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/cron/backfill-users", { method: "POST", headers });
}

function sessionsQuery(pks: string[]) {
  mocks.query.mockReturnValue({ fetchAll: () => Promise.resolve({ resources: pks.map((pk) => ({ pk })) }) });
}

describe("POST /api/cron/backfill-users", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    mocks.query.mockReset();
    mocks.itemRead.mockReset();
    mocks.create.mockReset();
    mocks.upsert.mockReset();
    mocks.create.mockResolvedValue(undefined);
    mocks.upsert.mockResolvedValue(undefined);
    mocks.itemRead.mockResolvedValue({ resource: undefined });
    process.env.CRON_SECRET = "top-secret";
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("rejects a request with no authorization header", async () => {
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.query).not.toHaveBeenCalled();
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

  it("no-ops cleanly when there are no session documents at all", async () => {
    sessionsQuery([]);
    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true, usersCreated: 0, alreadyExisted: 0, createdEmails: [],
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("dedupes multiple sessions for the same email into a single user creation", async () => {
    sessionsQuery(["rider@example.com", "rider@example.com"]);

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.usersCreated).toBe(1);
    expect(body.createdEmails).toEqual(["rider@example.com"]);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      id: "rider@example.com", pk: "rider@example.com", type: "user", email: "rider@example.com",
    }));
  });

  it("skips an email that already has a user document", async () => {
    sessionsQuery(["existing@example.com"]);
    mocks.itemRead.mockResolvedValue({ resource: { id: "existing@example.com" } });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.usersCreated).toBe(0);
    expect(body.alreadyExisted).toBe(1);
    expect(body.createdEmails).toEqual([]);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("handles a mix of existing and missing users correctly in the same run", async () => {
    sessionsQuery(["existing@example.com", "new@example.com"]);
    mocks.itemRead.mockImplementation(async (id: string) => ({
      resource: id === "existing@example.com" ? { id } : undefined,
    }));

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    const body = await response.json();

    expect(body.usersCreated).toBe(1);
    expect(body.alreadyExisted).toBe(1);
    expect(body.createdEmails).toEqual(["new@example.com"]);
  });

  it("writes a cronStatus summary doc once the run completes", async () => {
    sessionsQuery([]);
    await POST(request({ authorization: "Bearer top-secret" }));
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      id: "cronStatus::backfillUsers", pk: "system", type: "cronStatus",
    }));
  });

  it("isolates a single user's create failure and still processes the rest of the run", async () => {
    sessionsQuery(["broken@example.com", "fine@example.com"]);
    mocks.create.mockImplementation(async (doc: { email: string }) => {
      if (doc.email === "broken@example.com") throw new Error("Cosmos write failed");
    });

    const response = await POST(request({ authorization: "Bearer top-secret" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ email: "fine@example.com" }));
    expect(body.usersCreated).toBe(1);
    expect(body.createdEmails).toEqual(["fine@example.com"]);
    expect(body.errors).toEqual([{ email: "broken@example.com", error: "Cosmos write failed" }]);
  });

  // Idempotency: proves the source's own "re-running this is always
  // safe" claim for real, rather than just asserting it in a comment. A
  // stateful fake (itemRead/create sharing one Set) is what makes the
  // second POST actually see the first POST's write - same shape as
  // the real .item(email, email).read() existence check.
  it("running the cron twice in a row only ever creates each user once", async () => {
    const existingUsers = new Set<string>();
    sessionsQuery(["rider@example.com"]);
    mocks.itemRead.mockImplementation(async (id: string) => ({
      resource: existingUsers.has(id) ? { id } : undefined,
    }));
    mocks.create.mockImplementation(async (doc: { email: string }) => {
      existingUsers.add(doc.email);
    });

    const first = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await first.json()).toMatchObject({ usersCreated: 1, alreadyExisted: 0 });

    const second = await POST(request({ authorization: "Bearer top-secret" }));
    expect(await second.json()).toMatchObject({ usersCreated: 0, alreadyExisted: 1 });

    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
});
