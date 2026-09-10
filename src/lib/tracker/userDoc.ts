// Place at: src/lib/tracker/userDoc.ts
//
// The minimal, dependency-free read side of the `type: "user"` Cosmos
// doc (created by createSessionForEmail in src/lib/auth/session.ts on
// first sign-in). Deliberately its own file, separate from
// userAccount.ts's mutations (block/grant/delete) - those need
// bike.ts's getBikesForUser/deleteBike for account deletion, and
// bike.ts already imports isPro from subscriptions.ts for the
// free-tier cap check. subscriptions.ts and auth/session.ts both need
// to read this same doc (isPro() for the plan field, getSession() for
// the blocked field) without pulling bike.ts - and therefore
// subscriptions.ts itself - into their own dependency graph, which
// would be a real circular import (subscriptions -> userAccount ->
// bike -> subscriptions). Keeping the plain read here breaks that
// cycle before it exists.
import { getContainer } from "@/lib/cosmos";

export interface UserDoc {
  id: string;
  pk: string;
  type: "user";
  email: string;
  createdAt: string;
  blocked?: boolean;
  blockedAt?: string;
  // grantedBy is always "admin" for now - there's only one admin
  // identity in this app (a single shared password+TOTP login, see
  // src/lib/admin/session.ts), not a per-admin value worth tracking
  // until that changes.
  plan?: { grantedAt: string; expiresAt: string };
  // Per-user 2FA, distinct from the admin panel's own single shared
  // TOTP secret (src/lib/admin/session.ts) - see src/lib/auth/twoFactor.ts
  // for the enroll/disable/verify logic that reads and writes this.
  totp?: {
    secretEncrypted: string;
    enabled: boolean;
    enrolledAt: string;
    backupCodeHashes: string[];
  };
  // Settings tab profile - what the AI assistant addresses the user by
  // (see assistant/route.ts's USER'S NAME block) and what shows in the
  // sidebar avatar. Both optional; unset falls back to email-derived
  // initials everywhere they'd otherwise appear.
  displayName?: string;
  // Points at a small, already-resized (~256px) JPEG in the same blob
  // container the receipt/attachment system uses - see
  // api/account/avatar/route.ts. Never the original upload; that's
  // resized down before it's ever written to storage.
  avatarBlobName?: string;
  // Self-serve account deletion is a soft delete: these two fields mark
  // an account as scheduled, not gone. userAccount.ts's deleteAccount()
  // (the real, irreversible cascade) is only ever called once
  // pendingDeletionAt has passed, by the hard-delete-expired-accounts
  // cron job - never directly from the self-serve request route.
  deletionRequestedAt?: string;
  pendingDeletionAt?: string;
  // Per-account cooldown on the Buying Guide's free VDI/valuation
  // add-on (see vdiCheckUsage.ts) - Pro accounts skip this entirely, so
  // it's only ever read/written for free accounts.
  vdiCheckUsage?: { lastRunAt: string };
}

export async function getUserDoc(email: string): Promise<UserDoc | null> {
  const container = getContainer();
  const { resource } = await container.item(email, email).read<UserDoc>();
  return resource ?? null;
}

export async function isAccountBlocked(email: string): Promise<boolean> {
  const user = await getUserDoc(email);
  return !!user?.blocked;
}
