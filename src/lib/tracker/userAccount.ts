// Place at: src/lib/tracker/userAccount.ts
//
// Account-level moderation for the admin panel (/tomasz): blocking,
// permanent deletion, and admin-granted Premium - the manual stand-in
// for real billing until Stripe (or another platform) is wired up. See
// userDoc.ts for the plain read side (getUserDoc/isAccountBlocked)
// this builds on, and subscriptions.ts's isPro(), which reads the same
// `plan` field grantPremium() writes here.
import { getContainer } from "@/lib/cosmos";
import { getUserDoc, type UserDoc } from "@/lib/tracker/userDoc";
import { getBikesForUser, deleteBike } from "@/lib/tracker/bike";
import { getCarsForUser, deleteCar } from "@/lib/tracker/car";

export const MAX_GRANT_YEARS = 3;

// Every user document ever created (see createSessionForEmail in
// auth/session.ts) - the same underlying query getAllUserEmails()
// (notification.ts) already runs for the "send to everyone" broadcast,
// but returning the full document here, since the admin account list
// needs to show blocked/plan state too, not just the email.
export async function getAllUserAccounts(): Promise<UserDoc[]> {
  const container = getContainer();
  const { resources } = await container.items
    .query<UserDoc>({ query: "SELECT * FROM c WHERE c.type = 'user'" })
    .fetchAll();
  return resources;
}

export async function blockAccount(email: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);
  user.blocked = true;
  user.blockedAt = new Date().toISOString();
  await container.items.upsert(user);
}

export async function unblockAccount(email: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);
  delete user.blocked;
  delete user.blockedAt;
  await container.items.upsert(user);
}

// Signs a user out everywhere immediately, without blocking or deleting
// the account - the same point-delete-by-type query deleteAccount()
// below already runs for "session" docs as part of its full cascade,
// standalone here so an admin can force a re-login (e.g. a suspected
// compromised session) without the much stronger, irreversible effects
// blocking or deleting would also carry.
export async function revokeAllSessions(email: string): Promise<number> {
  const container = getContainer();
  const { resources } = await container.items
    .query<{ id: string }>(
      { query: "SELECT c.id FROM c WHERE c.type = 'session'" },
      { partitionKey: email }
    )
    .fetchAll();
  await Promise.all(resources.map((r) => container.item(r.id, email).delete()));
  return resources.length;
}

// expiresAt is capped at MAX_GRANT_YEARS from now, enforced here (not
// just in the admin form) - this is the one real limit on how much
// free access a single grant can hand out.
export async function grantPremium(email: string, expiresAt: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);

  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) throw new Error("Invalid expiry date.");
  if (expiresAtMs <= Date.now()) throw new Error("Expiry date must be in the future.");

  const maxAllowed = new Date();
  maxAllowed.setFullYear(maxAllowed.getFullYear() + MAX_GRANT_YEARS);
  if (expiresAtMs > maxAllowed.getTime()) throw new Error(`Grants can't exceed ${MAX_GRANT_YEARS} years.`);

  user.plan = { grantedAt: new Date().toISOString(), expiresAt };
  await container.items.upsert(user);
}

export async function revokePremium(email: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);
  delete user.plan;
  await container.items.upsert(user);
}

// Settings tab profile - either field can be updated independently
// (e.g. removing the avatar shouldn't require re-sending the display
// name), so only the fields actually passed are touched.
export async function updateProfile(
  email: string,
  updates: { displayName?: string | null; avatarBlobName?: string | null }
): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);

  if ("displayName" in updates) {
    if (updates.displayName) user.displayName = updates.displayName;
    else delete user.displayName;
  }
  if ("avatarBlobName" in updates) {
    if (updates.avatarBlobName) user.avatarBlobName = updates.avatarBlobName;
    else delete user.avatarBlobName;
  }
  await container.items.upsert(user);
}

export const ACCOUNT_DELETION_GRACE_PERIOD_DAYS = 30;

// Starts the self-serve deletion clock - this is deliberately NOT the
// same thing as deleteAccount() above, and never calls it. It just
// marks the account as scheduled; the actual, irreversible cascade only
// ever runs later, from the hard-delete-expired-accounts cron job, once
// pendingDeletionAt has passed. Returns the deadline so callers (the
// API route, the confirmation email) don't each recompute it themselves.
export async function requestAccountDeletion(email: string): Promise<{ deleteAfter: string }> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);

  const now = new Date();
  const deleteAfter = new Date(now);
  deleteAfter.setDate(deleteAfter.getDate() + ACCOUNT_DELETION_GRACE_PERIOD_DAYS);

  user.deletionRequestedAt = now.toISOString();
  user.pendingDeletionAt = deleteAfter.toISOString();
  await container.items.upsert(user);

  return { deleteAfter: user.pendingDeletionAt };
}

// Reverses requestAccountDeletion above - the account was never
// touched beyond those two fields, so undoing this is just clearing
// them, nothing to restore.
export async function cancelAccountDeletion(email: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);
  delete user.deletionRequestedAt;
  delete user.pendingDeletionAt;
  await container.items.upsert(user);
}

// Pure presentation helper shared by page.tsx's two render paths (bike
// dashboard and renderCarDashboard) - both need the exact same
// day-count/date-label derived from pendingDeletionAt, once for the
// DashboardShell banner and once for SettingsTab's own copy of the
// same notice.
export function getPendingDeletionInfo(user: UserDoc | null): { daysRemaining: number; deleteAfterLabel: string } | null {
  if (!user?.pendingDeletionAt) return null;
  const daysRemaining = Math.max(0, Math.ceil((new Date(user.pendingDeletionAt).getTime() - Date.now()) / 86400000));
  const deleteAfterLabel = new Date(user.pendingDeletionAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  return { daysRemaining, deleteAfterLabel };
}

// Permanently deletes an account and everything tied to its email -
// there is no "undo" here, matched by the strongest confirmation this
// admin panel has (see DeleteAccountButton.tsx - a typed-email prompt,
// not just a yes/no dialog). Cascades:
// - every bike, via the existing deleteBike() (already cascades
//   service/fuel/mod/bill/reminder/labour records plus that bike's own
//   share-link doc - see bike.ts's own comment on deleteBike)
// - every car, via the existing deleteCar() (same idea, car-prefixed
//   record types - see car.ts's own comment on deleteCar)
// - every other document type keyed by this email as partition key,
//   point-deleted directly below
// - assistantQuestionLog entries mentioning this email - the one doc
//   type NOT partitioned by email (a fixed shared partition instead,
//   see assistantQuestionLog.ts), so this is a cross-partition query
//   rather than a point-delete, and best-effort: a leftover log line
//   is a cosmetic loss, not a reason to fail the whole deletion.
export async function deleteAccount(email: string): Promise<void> {
  const container = getContainer();

  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  await Promise.all([
    ...bikes.map((bike) => deleteBike(email, bike.id)),
    ...cars.map((car) => deleteCar(email, car.id)),
  ]);

  const pointDeleteTypes = ["user", "session", "magicLink", "notification", "pendingScanBatch", "bikeTransferRequest", "receiptRequest"];
  await Promise.all(
    pointDeleteTypes.map(async (type) => {
      const { resources } = await container.items
        .query<{ id: string }>(
          { query: "SELECT c.id FROM c WHERE c.type = @type", parameters: [{ name: "@type", value: type }] },
          { partitionKey: email }
        )
        .fetchAll();
      await Promise.all(resources.map((r) => container.item(r.id, email).delete()));
    })
  );

  try {
    const { resources } = await container.items
      .query<{ id: string; pk: string }>({
        query: "SELECT c.id, c.pk FROM c WHERE c.type = 'assistantQuestion' AND c.email = @email",
        parameters: [{ name: "@email", value: email }],
      })
      .fetchAll();
    await Promise.all(resources.map((r) => container.item(r.id, r.pk).delete()));
  } catch (err) {
    console.error(`deleteAccount: failed to clean up assistantQuestion entries for ${email}:`, err);
  }
}
