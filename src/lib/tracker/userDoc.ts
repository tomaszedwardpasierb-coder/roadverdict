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
