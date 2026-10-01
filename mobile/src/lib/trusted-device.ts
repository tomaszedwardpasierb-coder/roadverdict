// Opening the Vault with this phone's fingerprint, face or PIN instead of
// an authenticator code. The phone is trusted once, right after a real
// code (the server only allows it then), and gets a secret of its own,
// kept in the app's encrypted storage. Opening the Vault later asks the
// phone to confirm it's the owner - fingerprint or face, falling back to
// the phone's PIN, pattern or password - and only then sends that secret.
// If the server no longer trusts this phone (removed in Settings, or
// two-factor turned off), it's forgotten here too and the code is back.
import * as Device from 'expo-device';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

import { apiFetch } from '@/lib/api';
import { setVaultToken, vaultHeaders, type PreviousAccess } from '@/lib/vault';

const DEVICE_ID_KEY = 'rv.vault.deviceId';
const SECRET_KEY = 'rv.vault.deviceSecret';
const DECLINED_KEY = 'rv.vault.quickUnlockDeclined';

// The phone has something to confirm the owner with - a fingerprint, a
// face, or at least a screen lock PIN, pattern or password.
export async function phoneCanConfirmOwner(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) > LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

async function confirmOwner(promptMessage: string): Promise<boolean> {
  const level = await LocalAuthentication.getEnrolledLevelAsync().catch(() => LocalAuthentication.SecurityLevel.NONE);
  if (level === LocalAuthentication.SecurityLevel.NONE) return false;
  const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: 'Use a code instead', disableDeviceFallback: false });
  return result.success;
}

export async function isThisPhoneTrusted(): Promise<boolean> {
  try {
    return !!(await SecureStore.getItemAsync(DEVICE_ID_KEY)) && !!(await SecureStore.getItemAsync(SECRET_KEY));
  } catch {
    return false;
  }
}

// On sign-out: the server stops trusting this phone and it forgets its
// secret, so whoever signs in next on it starts from an authenticator code.
export async function untrustThisPhone(token: string | null): Promise<void> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  await forgetThisPhone();
  if (deviceId && token) await apiFetch(`/api/account/trusted-devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE', token });
}

export async function forgetThisPhone(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_ID_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(SECRET_KEY).catch(() => {});
}

// Whether to offer "use your fingerprint next time" after a code unlock.
export async function shouldOfferQuickUnlock(): Promise<boolean> {
  if (await isThisPhoneTrusted()) return false;
  if (await SecureStore.getItemAsync(DECLINED_KEY).catch(() => null)) return false;
  return phoneCanConfirmOwner();
}

export async function declineQuickUnlock(): Promise<void> {
  await SecureStore.setItemAsync(DECLINED_KEY, '1').catch(() => {});
}

// Needs the Vault open (just unlocked with a code) - the server checks.
export async function trustThisPhone(token: string | null): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await confirmOwner('Confirm it’s you to use this next time'))) {
    return { ok: false, error: 'Your fingerprint, face or phone PIN wasn’t confirmed, so nothing changed.' };
  }
  const name = [Device.manufacturer, Device.modelName].filter(Boolean).join(' ') || 'Android phone';
  const result = await apiFetch<{ deviceId: string; secret: string }>('/api/vault/trusted-devices', {
    method: 'POST',
    token,
    headers: vaultHeaders(null),
    body: { name },
  });
  if (!result.ok) return { ok: false, error: result.error };
  await SecureStore.setItemAsync(DEVICE_ID_KEY, result.data.deviceId);
  await SecureStore.setItemAsync(SECRET_KEY, result.data.secret);
  await SecureStore.deleteItemAsync(DECLINED_KEY).catch(() => {});
  return { ok: true };
}

export type PhoneUnlock =
  | { ok: true; previousAccess: PreviousAccess | null }
  | { ok: false; reason: 'cancelled' | 'not-trusted' | 'error'; error?: string; status?: number };

export async function unlockWithThisPhone(token: string | null): Promise<PhoneUnlock> {
  const deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY).catch(() => null);
  const secret = await SecureStore.getItemAsync(SECRET_KEY).catch(() => null);
  if (!deviceId || !secret) return { ok: false, reason: 'not-trusted' };
  if (!(await confirmOwner('Open the Vault'))) return { ok: false, reason: 'cancelled' };
  const result = await apiFetch<{ vaultToken: string; previousAccess?: PreviousAccess | null }>('/api/vault/device-unlock', {
    method: 'POST',
    token,
    body: { deviceId, secret },
  });
  if (!result.ok) {
    // The device-unlock route's own wording for a phone it no longer trusts.
    if (result.status === 401 && result.error === "This phone isn't trusted any more.") {
      await forgetThisPhone();
      return { ok: false, reason: 'not-trusted', error: 'This phone isn’t trusted any more - enter your code instead.' };
    }
    return { ok: false, reason: 'error', error: result.error, status: result.status };
  }
  setVaultToken(result.data.vaultToken);
  return { ok: true, previousAccess: result.data.previousAccess ?? null };
}

