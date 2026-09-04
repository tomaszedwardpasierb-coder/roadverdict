// Place at: src/lib/admin/impersonation.ts
import { getContainer } from "@/lib/cosmos";

const ADMIN_PK = "admin";

// Checks for real evidence this account has actually been used, rather
// than trusting the newer `type: "user"` marker doc alone - that doc is
// only reliably created going forward (createSessionForEmail only makes
// one on a login that finds nothing existing yet), so it's absent for
// every account that was already active before that code shipped. A
// session doc (a real completed login) or a bike doc (real usage) are
// both signals that predate that convention and cover every real account.
export async function userExists(email: string): Promise<boolean> {
  const container = getContainer();
  try {
    const { resources } = await container.items
      .query({
        query:
          "SELECT VALUE COUNT(1) FROM c WHERE c.pk = @email AND (c.type = 'user' OR c.type = 'session' OR c.type = 'bike')",
        parameters: [{ name: "@email", value: email }],
      })
      .fetchAll();
    return (resources[0] ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function logImpersonation(targetEmail: string, ip: string, action: "start" | "end"): Promise<void> {
  const container = getContainer();
  await container.items.create({
    id: `impersonation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    pk: ADMIN_PK,
    type: "adminImpersonation",
    targetEmail,
    action,
    at: new Date().toISOString(),
    ip,
  });
}

const IMPERSONATION_LOG_RETENTION_DAYS = 365;

// No Cosmos ttl here on purpose - unlike the app's other short-lived
// docs, this is an audit trail meant to support a later fraud/incident
// review, so it should outlive a normal session by a long way rather
// than silently expire on a fixed short clock. A year is a standard
// audit-log retention floor, not a technical necessity.
export async function purgeOldImpersonationLogs(): Promise<number> {
  const container = getContainer();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - IMPERSONATION_LOG_RETENTION_DAYS);
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'adminImpersonation' AND c.at < @cutoff",
        parameters: [{ name: "@cutoff", value: cutoff.toISOString() }],
      },
      { partitionKey: ADMIN_PK }
    )
    .fetchAll();
  const results = await Promise.allSettled(resources.map((r) => container.item(r.id, ADMIN_PK).delete()));
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`purgeOldImpersonationLogs: ${failures.length} of ${resources.length} failed to delete:`, failures);
  }
  return results.filter((r) => r.status === "fulfilled").length;
}
