// Place at: src/lib/tracker/vaultAccess.ts
//
// The combined "is this request actually allowed to touch the Vault"
// check - session, Pro, 2FA, and an unlocked vault session, in that
// order. Every Vault route (list/upload/delete/download) needs the
// exact same four checks; factored into one place deliberately, unlike
// this codebase's usual small per-route helpers (e.g. getClientIp is
// duplicated across several routes) - a security gate is exactly the
// kind of logic where letting copies drift apart over time is a real
// risk, not just repetition.
import type { NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isPro } from "@/lib/subscriptions";
import { isTwoFactorEnabled } from "@/lib/auth/twoFactor";
import { resolveVaultUnlock } from "@/lib/tracker/vaultSession";

export type VaultGateResult = { ok: true; email: string; raw: string } | { ok: false; status: number; error: string };

export async function checkVaultGate(request: NextRequest): Promise<VaultGateResult> {
  const session = await getSession();
  if (!session) return { ok: false, status: 401, error: "Not signed in." };

  if (!(await isPro(session.email))) {
    return { ok: false, status: 403, error: "The Vault is a Premium feature." };
  }
  if (!(await isTwoFactorEnabled(session.email))) {
    return { ok: false, status: 403, error: "Enable two-factor authentication in Settings to use the Vault." };
  }

  const raw = await resolveVaultUnlock(request, session.email);
  if (!raw) return { ok: false, status: 401, error: "vault_locked" };

  return { ok: true, email: session.email, raw };
}
