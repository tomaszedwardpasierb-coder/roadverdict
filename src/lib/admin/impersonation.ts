// Place at: src/lib/admin/impersonation.ts
import { getContainer } from "@/lib/cosmos";

const ADMIN_PK = "admin";

// Deliberately checks for a real, already-existing user doc rather than
// letting createSessionForEmail's own auto-create-on-missing behaviour
// silently spin up a phantom account for a mistyped or made-up email -
// impersonation should only ever be possible against a genuine account.
export async function userExists(email: string): Promise<boolean> {
  const container = getContainer();
  try {
    const { resource } = await container.item(email, email).read();
    return !!resource && resource.type === "user";
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
