// Place at: tests/integration/impersonation.integration.test.ts
//
// Exercises purgeOldImpersonationLogs() (src/lib/admin/impersonation.ts)
// against the real Cosmos DB Emulator. Like assistantConfig's version
// history, these docs share one FIXED partition ("admin") rather than
// a fresh one per test, so this only ever checks the fate of its own
// specifically-tracked fixture ids (never a global count or a
// blanket-delete of the partition, which could remove real admin data
// sharing this Cosmos account).
import { afterEach, describe, expect, it } from "vitest";
import { getContainer } from "@/lib/cosmos";
import { purgeOldImpersonationLogs } from "@/lib/admin/impersonation";

const ADMIN_PK = "admin";

async function createRawLog(at: string): Promise<string> {
  const container = getContainer();
  const id = `impersonation-integration-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await container.items.create({
    id,
    pk: ADMIN_PK,
    type: "adminImpersonation",
    targetEmail: "rider@example.com",
    action: "start",
    at,
    ip: "127.0.0.1",
  });
  return id;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

describe("purgeOldImpersonationLogs against a real Cosmos container (emulator)", () => {
  let createdIds: string[];

  afterEach(async () => {
    const container = getContainer();
    await Promise.all(createdIds.map((id) => container.item(id, ADMIN_PK).delete().catch(() => {})));
  });

  it("deletes a log entry older than the 1-year cutoff", async () => {
    const id = await createRawLog(daysAgo(400));
    createdIds = [id];

    await purgeOldImpersonationLogs();

    const container = getContainer();
    const { resource } = await container.item(id, ADMIN_PK).read();
    expect(resource).toBeUndefined();
  });

  it("keeps a recent log entry", async () => {
    const id = await createRawLog(daysAgo(10));
    createdIds = [id];

    await purgeOldImpersonationLogs();

    const container = getContainer();
    const { resource } = await container.item(id, ADMIN_PK).read();
    expect(resource).toBeDefined();
  });
});
