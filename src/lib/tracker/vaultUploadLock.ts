// Place at: src/lib/tracker/vaultUploadLock.ts
//
// A per-vehicle advisory mutex for Vault uploads, closing the race where
// two concurrent uploads for the same vehicle could both read the
// document-count/total-size caps before either write landed, together
// exceeding the 20-document/100MB limits. Cosmos guarantees only one
// items.create() with a given id+pk can ever succeed - the loser gets a
// 409 immediately, which the caller turns into a "try again in a
// moment" response rather than silently letting both uploads through.
// A short ttl means a crashed/hung request can never leave this stuck.
import { getContainer } from "@/lib/cosmos";

const LOCK_TTL_SECONDS = 30;

function lockId(vehicleId: string): string {
  return `vault-upload-lock:${vehicleId}`;
}

function isConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  return code === 409 || statusCode === 409;
}

export async function acquireVaultUploadLock(email: string, vehicleId: string): Promise<boolean> {
  const container = getContainer();
  try {
    await container.items.create({
      id: lockId(vehicleId),
      pk: email,
      type: "vaultUploadLock",
      createdAt: new Date().toISOString(),
      ttl: LOCK_TTL_SECONDS,
    });
    return true;
  } catch (err) {
    if (isConflict(err)) return false;
    throw err;
  }
}

export async function releaseVaultUploadLock(email: string, vehicleId: string): Promise<void> {
  const container = getContainer();
  try {
    await container.item(lockId(vehicleId), email).delete();
  } catch {
    // Already gone (expired via ttl, or never actually created) - the
    // whole point of the ttl is that this is never a real problem.
  }
}
