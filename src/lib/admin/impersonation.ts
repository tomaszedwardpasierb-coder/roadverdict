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
