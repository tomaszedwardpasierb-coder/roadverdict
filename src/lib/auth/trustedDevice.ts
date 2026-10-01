// Place at: src/lib/auth/trustedDevice.ts
//
// Phones the owner has trusted to open the Vault with their fingerprint,
// face or phone PIN instead of an authenticator code. Trusting one needs
// the Vault already unlocked with a real code (see the trusted-devices
// route), and each phone holds a random secret of its own, kept in the
// app's encrypted storage and only read after the phone's own
// fingerprint/face/PIN check. Only the secret's SHA-256 hash is stored
// here, like every other token in this app (see crypto.ts).
//
// Turning two-factor off removes every trusted phone (see the TOTP
// disable route), so switching it back on never quietly revives an old one.
import { timingSafeEqual } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { generateToken, hashToken } from "@/lib/auth/crypto";

export const MAX_TRUSTED_DEVICES = 5;

interface TrustedDeviceDoc {
  id: string;
  pk: string; // owner's email
  type: "trustedDevice";
  name: string;
  secretHash: string;
  createdAt: string;
  lastUsedAt?: string;
}

export type TrustedDevice = { id: string; name: string; createdAt: string; lastUsedAt: string | null };

function view(doc: TrustedDeviceDoc): TrustedDevice {
  return { id: doc.id, name: doc.name, createdAt: doc.createdAt, lastUsedAt: doc.lastUsedAt ?? null };
}

export async function listTrustedDevices(email: string): Promise<TrustedDevice[]> {
  const { resources } = await getContainer()
    .items.query<TrustedDeviceDoc>(
      { query: "SELECT * FROM c WHERE c.type = 'trustedDevice' ORDER BY c.createdAt DESC" },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.map(view);
}

export async function createTrustedDevice(
  email: string,
  name: string
): Promise<{ ok: true; device: TrustedDevice; secret: string } | { ok: false; reason: "limit_reached" }> {
  const existing = await listTrustedDevices(email);
  if (existing.length >= MAX_TRUSTED_DEVICES) return { ok: false, reason: "limit_reached" };
  // The id is random too, so a device can't be guessed from its name.
  const id = generateToken().raw;
  const { raw: secret, hash: secretHash } = generateToken();
  const doc: TrustedDeviceDoc = {
    id,
    pk: email,
    type: "trustedDevice",
    name: name.trim().slice(0, 60) || "Phone",
    secretHash,
    createdAt: new Date().toISOString(),
  };
  await getContainer().items.create(doc);
  return { ok: true, device: view(doc), secret };
}

// True only for this owner's own device with exactly this secret.
export async function verifyTrustedDevice(email: string, deviceId: string, secret: string): Promise<boolean> {
  if (!deviceId || !secret) return false;
  let doc: TrustedDeviceDoc | undefined;
  try {
    ({ resource: doc } = await getContainer().item(deviceId, email).read<TrustedDeviceDoc>());
  } catch {
    return false;
  }
  if (!doc || doc.type !== "trustedDevice") return false;
  const given = Buffer.from(hashToken(secret), "hex");
  const stored = Buffer.from(doc.secretHash, "hex");
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return false;
  doc.lastUsedAt = new Date().toISOString();
  await getContainer().items.upsert(doc).catch(() => {});
  return true;
}

export async function removeTrustedDevice(email: string, deviceId: string): Promise<boolean> {
  try {
    const { resource } = await getContainer().item(deviceId, email).read<TrustedDeviceDoc>();
    if (!resource || resource.type !== "trustedDevice") return false;
    await getContainer().item(deviceId, email).delete();
    return true;
  } catch {
    return false;
  }
}

export async function removeAllTrustedDevices(email: string): Promise<void> {
  const devices = await listTrustedDevices(email);
  for (const d of devices) await removeTrustedDevice(email, d.id);
}
