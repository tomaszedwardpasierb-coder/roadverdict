// "Last run" bookkeeping for scheduled jobs: recorded for real runs (worked or
// failed), not for requests turned away for a wrong secret, and never able to
// break the job itself.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/cosmos", () => ({ getContainer: () => ({ items: { upsert: mocks.upsert } }) }));

import { withCronRun } from "@/lib/admin/cronRuns";

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.upsert.mockResolvedValue(undefined);
});

const req = new NextRequest("http://localhost/api/cron/x", { method: "POST" });

describe("withCronRun", () => {
  it("records a run that worked", async () => {
    const res = await withCronRun("indexnow", async () => new Response("{}", { status: 200 }))(req);
    expect(res.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "cronRun::indexnow", pk: "system", type: "cronRun", ok: true, status: 200 }));
  });

  it("records a run that failed", async () => {
    await withCronRun("weekly-report", async () => new Response("{}", { status: 500 }))(req);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ id: "cronRun::weekly-report", ok: false, status: 500 }));
  });

  it("doesn't record a request turned away for a wrong cron secret", async () => {
    await withCronRun("indexnow", async () => new Response("{}", { status: 401 }))(req);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("still returns the job's answer if the record can't be written", async () => {
    mocks.upsert.mockRejectedValue(new Error("cosmos down"));
    const res = await withCronRun("indexnow", async () => new Response("done", { status: 200 }))(req);
    expect(await res.text()).toBe("done");
  });
});
