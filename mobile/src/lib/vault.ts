// The Vault, for the app: the same documents, routes and rules as the
// website's Vault tab (Pro, two-step sign-in, a fresh code to open it,
// auto-lock after 10 quiet minutes). The website keeps its unlock in a
// cookie; the app has none, so /api/vault/reauth hands it the unlock
// token, which is sent back in the X-RV-Vault header.
//
// The token lives in memory only - never on the phone's storage - so
// closing the app locks the Vault. It's also dropped the moment the app
// goes to the background, and anything opened from the Vault is copied
// into one cache folder that's emptied whenever it locks.
import { Directory, File, Paths } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { API_BASE_URL, apiFetch, type ApiResult } from '@/lib/api';

export const VAULT_HEADER = 'X-RV-Vault';

// The server's own window (vaultSession.ts); the server enforces it -
// this only locks the screen at the same moment rather than on the next tap.
const AUTO_LOCK_MS = 10 * 60 * 1000;

export type VaultCategory = 'dvlaLegal' | 'insurance' | 'purchaseFinance' | 'licences' | 'modifications' | 'warranties' | 'overseas';

// The website's own categories and examples (vaultCategories.ts).
export const VAULT_CATEGORIES: { key: VaultCategory; label: string; examples: string }[] = [
  { key: 'dvlaLegal', label: 'DVLA / Legal', examples: 'V5C logbook, MOT certificate, SORN, private plate certificate' },
  { key: 'insurance', label: 'Insurance', examples: 'Certificate, policy schedule, breakdown cover' },
  { key: 'purchaseFinance', label: 'Purchase & Finance', examples: 'Bill of sale, finance agreement, HPI / VDI report' },
  { key: 'licences', label: 'Licences & Entitlements', examples: 'Driving licence, CBT, test pass, IAM / RoSPA' },
  { key: 'modifications', label: 'Modifications & Homologation', examples: 'IVA, engineer’s letter, recall completion' },
  { key: 'warranties', label: 'Warranties', examples: 'Manufacturer or extended warranty' },
  { key: 'overseas', label: 'Overseas / Touring', examples: 'Carnet, green card, import documents' },
];

export function categoryLabel(key: string): string {
  return VAULT_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export type VaultDocument = {
  id: string;
  vehicleKind: 'bike' | 'car';
  vehicleId: string;
  fileName: string;
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSize: number;
  category: VaultCategory;
  label?: string;
  uploadedAt: string;
};

export type PreviousAccess = { at: string; browser: string; country: string | null };

// The server's own limits (vaultDocument.ts).
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS = 20;

// ---- The unlock, in memory ----

type Unlock = { token: string; lastActive: number } | null;
let unlock: Unlock = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function cacheFolder(): Directory {
  return new Directory(Paths.cache, 'vault');
}

function emptyCache() {
  try {
    const folder = cacheFolder();
    if (folder.exists) folder.delete();
  } catch {
    // Nothing there, or already going - the OS clears caches anyway.
  }
}

export function setVaultToken(token: string) {
  unlock = { token, lastActive: Date.now() };
  emit();
}

// Locks here and empties the cache; telling the server is the caller's
// job (lockVault), since a lock must never wait on the network.
export function forgetVault() {
  if (!unlock) return;
  unlock = null;
  emptyCache();
  emit();
}

function currentToken(): string | null {
  if (unlock && Date.now() - unlock.lastActive > AUTO_LOCK_MS) forgetVault();
  return unlock?.token ?? null;
}

export function markVaultActive() {
  if (unlock) unlock.lastActive = Date.now();
}

// Locks once the quiet window has passed - the screen calls this on a
// timer, so it locks at the same moment the server would.
export function checkVaultExpiry() {
  currentToken();
}

export function useVaultUnlocked(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // Read-only on purpose: a render must never change the store.
    () => unlock !== null && Date.now() - unlock.lastActive <= AUTO_LOCK_MS
  );
}

// Leaving the app locks the Vault, like a banking app - except while the
// Vault itself has opened the camera, a file picker or the share sheet,
// which also send the app to the background.
let holds = 0;

export async function whileVaultOpen<T>(action: () => Promise<T>): Promise<T> {
  holds++;
  try {
    return await action();
  } finally {
    holds--;
    markVaultActive();
  }
}

AppState.addEventListener('change', (state) => {
  if (state !== 'active' && holds === 0) forgetVault();
});

// ---- Requests ----

// Read-only (no expiry check), since the photo viewer calls it while drawing.
export function vaultHeaders(token: string | null): Record<string, string> {
  const vault = unlock?.token ?? null;
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(vault ? { [VAULT_HEADER]: vault } : {}),
  };
}

// The server says "vault_locked" once its session has lapsed.
export function isLocked(result: ApiResult<unknown>): boolean {
  return !result.ok && result.status === 401 && result.error === 'vault_locked';
}

export async function vaultFetch<T>(
  path: string,
  token: string | null,
  options: { method?: 'GET' | 'POST' | 'DELETE'; body?: unknown } = {}
): Promise<ApiResult<T>> {
  const vault = currentToken();
  const result = await apiFetch<T>(path, { ...options, token, headers: vault ? { [VAULT_HEADER]: vault } : {} });
  if (isLocked(result)) forgetVault();
  else if (result.ok) markVaultActive();
  return result;
}

export async function lockVault(token: string | null) {
  const vault = currentToken();
  forgetVault();
  if (vault) await apiFetch('/api/vault/lock', { method: 'POST', token, headers: { [VAULT_HEADER]: vault } });
}

// Uploads go as multipart, with an expo-file-system File (see scan.ts for
// why Expo's fetch needs one).
export async function uploadVaultDocument(
  token: string | null,
  input: { uri: string; name: string; mimeType: string; vehicleKind: 'bike' | 'car'; vehicleId: string; category: VaultCategory; label: string }
): Promise<ApiResult<{ document: VaultDocument }>> {
  const file = new File(input.uri);
  const form = new FormData();
  form.append('file', file);
  form.append('vehicleKind', input.vehicleKind);
  form.append('vehicleId', input.vehicleId);
  form.append('category', input.category);
  if (input.label.trim()) form.append('label', input.label.trim());
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/vault/documents`, {
      method: 'POST',
      headers: { Accept: 'application/json', ...vaultHeaders(token) },
      body: form,
    });
  } catch {
    return { ok: false, status: 0, error: 'Can’t reach RoadVerdict. Check your connection and try again.' };
  }
  const data = (await response.json().catch(() => null)) as { document?: VaultDocument; error?: string } | null;
  if (!response.ok || !data?.document) {
    const result: ApiResult<{ document: VaultDocument }> = { ok: false, status: response.status, error: data?.error ?? 'Upload failed. Please try again.' };
    if (isLocked(result)) forgetVault();
    return result;
  }
  markVaultActive();
  return { ok: true, status: response.status, data: { document: data.document } };
}

// Fetches a document into the Vault's cache folder - the preview as it
// is, or a download (stamped with the owner's email and the time, unless
// they chose otherwise, exactly as on the website).
export async function fetchVaultFile(
  token: string | null,
  doc: VaultDocument,
  kind: 'preview' | 'download',
  watermark = true
): Promise<{ ok: true; uri: string } | { ok: false; locked: boolean; error: string }> {
  const path = `/api/vault/documents/${encodeURIComponent(doc.id)}/${kind}${kind === 'download' && !watermark ? '?watermark=0' : ''}`;
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { headers: vaultHeaders(token) });
  } catch {
    return { ok: false, locked: false, error: 'Can’t reach RoadVerdict. Check your connection and try again.' };
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    const locked = response.status === 401 && data?.error === 'vault_locked';
    if (locked) forgetVault();
    return { ok: false, locked, error: data?.error ?? 'That document couldn’t be opened. Try again.' };
  }
  const folder = cacheFolder();
  folder.create({ idempotent: true, intermediates: true });
  const safeName = doc.fileName.replace(/[^\w.-]+/g, '_') || 'document';
  const file = new File(folder, `${kind}-${doc.id.slice(0, 8)}-${safeName}`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(await response.arrayBuffer()));
  markVaultActive();
  return { ok: true, uri: file.uri };
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
