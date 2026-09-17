// Place at: src/lib/tracker/userAccount.ts
//
// Account-level moderation for the admin panel (/tomasz): blocking,
// permanent deletion, and admin-granted Premium - the manual stand-in
// for real billing until Stripe (or another platform) is wired up. See
// userDoc.ts for the plain read side (getUserDoc/isAccountBlocked)
// this builds on, and subscriptions.ts's isPro(), which reads the same
// `plan` field grantPremium() writes here.
import { getContainer } from "@/lib/cosmos";
import { getAttachmentContainer } from "@/lib/blobStorage";
import { getUserDoc, type UserDoc, type OnboardingStep } from "@/lib/tracker/userDoc";
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

// Silently does nothing on an account with no `onboarding` field at all -
// every call site (14 log-entry routes, the assistant route, both
// share-link routes, the compare page) calls this unconditionally after
// its own real success, best-effort, rather than checking first whether
// the feature happens to be active for this account. That's deliberate:
// it keeps every one of those call sites a plain one-line addition, not
// a conditional guarded on a field they'd otherwise have no reason to
// know about.
export async function markOnboardingStepComplete(email: string, step: OnboardingStep): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user?.onboarding) return;
  if (user.onboarding.completedSteps.includes(step)) return;
  user.onboarding.completedSteps = [...user.onboarding.completedSteps, step];
  await container.items.upsert(user);
}

// Toggles the checklist card's own visibility, independent of progress -
// dismissing never clears completedSteps, and un-dismissing (the card's
// own "show again" link once collapsed) picks up exactly where it left off.
export async function setOnboardingChecklistDismissed(email: string, dismissed: boolean): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user?.onboarding) return;
  if (dismissed) user.onboarding.dismissedChecklistAt = new Date().toISOString();
  else delete user.onboarding.dismissedChecklistAt;
  await container.items.upsert(user);
}

// The /tomasz admin action for an account that existed before this
// feature shipped (see UserDoc.onboarding's own comment) - idempotent,
// so re-running it on an account that already has the field on (e.g. a
// double-click) never wipes real progress back to zero.
export async function enableOnboardingChecklist(email: string): Promise<void> {
  const container = getContainer();
  const user = await getUserDoc(email);
  if (!user) throw new Error(`No account found for ${email}.`);
  if (user.onboarding) return;
  user.onboarding = { completedSteps: [] };
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

// Shared by deleteAccount below for every doc type that's NOT
// partitioned by this account's own email - assistantQuestion (a fixed
// shared partition, see assistantQuestionLog.ts) and vdiPurchase (pk is
// its own generated id, email only a field on the doc - see
// vdiPurchase.ts) both need this cross-partition query-then-delete
// rather than the plain point-delete loop below. Best-effort: a
// leftover row here is a cosmetic/minor-retention loss, not a reason to
// fail the whole account deletion.
async function deleteCrossPartitionDocsByEmailField(
  container: ReturnType<typeof getContainer>,
  type: string,
  email: string
): Promise<void> {
  try {
    const { resources } = await container.items
      .query<{ id: string; pk: string }>({
        query: "SELECT c.id, c.pk FROM c WHERE c.type = @type AND c.email = @email",
        parameters: [
          { name: "@type", value: type },
          { name: "@email", value: email },
        ],
      })
      .fetchAll();
    await Promise.all(resources.map((r) => container.item(r.id, r.pk).delete()));
  } catch (err) {
    console.error(`deleteAccount: failed to clean up ${type} entries for ${email}:`, err);
  }
}

// Best-effort - a leftover avatar blob is a storage cost, not a reason
// to fail the whole account deletion. Previously never called at all:
// the Cosmos "user" doc pointing at this blob was gone once deleted,
// but the JPEG/PNG itself stayed in the attachments container forever.
async function deleteAvatarBlobBestEffort(email: string, avatarBlobName: string | undefined): Promise<void> {
  if (!avatarBlobName) return;
  const container = await getAttachmentContainer();
  await container.getBlockBlobClient(avatarBlobName).deleteIfExists().catch((err) => {
    console.error(`deleteAccount: failed to delete avatar blob for ${email}:`, err);
  });
}

// Permanently deletes an account and everything tied to its email -
// there is no "undo" here, matched by the strongest confirmation this
// admin panel has (see DeleteAccountButton.tsx - a typed-email prompt,
// not just a yes/no dialog). Cascades:
// - every bike, via deleteBike() (service/fuel/mod/bill/billSeries/
//   reminder/labour/fine/toll records, every share-link doc this bike
//   ever had, every Vault document and its blob, and every attachment
//   blob any of those records referenced - see bike.ts's own comment)
// - every car, via deleteCar() (same idea, car-prefixed - see car.ts's
//   own comment)
// - the account's own avatar blob (deleteAvatarBlobBestEffort)
// - every other document type keyed by this email as partition key,
//   point-deleted directly below
// - assistantQuestion and vdiPurchase entries mentioning this email -
//   the two doc types NOT partitioned by email (see
//   deleteCrossPartitionDocsByEmailField above)
export async function deleteAccount(email: string): Promise<void> {
  const container = getContainer();

  // Read once, up front - the point-delete loop below removes the
  // "user" doc that carries avatarBlobName, but the blob delete itself
  // doesn't need to be sequenced with that, only this read does.
  const user = await getUserDoc(email);

  const [bikes, cars] = await Promise.all([getBikesForUser(email), getCarsForUser(email)]);
  await Promise.all([
    ...bikes.map((bike) => deleteBike(email, bike.id)),
    ...cars.map((car) => deleteCar(email, car.id)),
    deleteAvatarBlobBestEffort(email, user?.avatarBlobName),
  ]);

  // carTransferRequest/carReceiptRequest were missing here despite being
  // pk=email like their bike-side equivalents already in this list - a
  // real asymmetry, not an intentional car/bike difference. The
  // totp*/trackerWriteAttempt/vaultSession/vaultUploadLock types all
  // self-expire via their own short TTL regardless, but there's no
  // reason to wait that out when a real deletion request has already
  // been made - deleting them now just makes erasure immediate instead
  // of eventual.
  const pointDeleteTypes = [
    "user", "session", "magicLink", "notification", "pendingScanBatch",
    "bikeTransferRequest", "receiptRequest", "carTransferRequest", "carReceiptRequest",
    "totpEnrollmentPending", "totpPendingLogin", "totpAttempt", "trackerWriteAttempt",
    "vaultSession", "vaultUploadLock",
  ];
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

  await Promise.all([
    deleteCrossPartitionDocsByEmailField(container, "assistantQuestion", email),
    deleteCrossPartitionDocsByEmailField(container, "vdiPurchase", email),
  ]);
}
