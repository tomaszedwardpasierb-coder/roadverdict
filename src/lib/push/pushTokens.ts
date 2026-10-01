// Place at: src/lib/push/pushTokens.ts
//
// The phones a signed-in owner gets push notifications on: one Expo push
// token per installed app, registered by the app after sign-in and removed
// on sign-out (or when Expo reports the app gone). Keyed by the token's
// hash, so the same phone registering again just refreshes its entry.
import { getContainer } from "@/lib/cosmos";
import { hashToken } from "@/lib/auth/crypto";

interface PushTokenDoc {
  id: string;
  pk: string; // owner's email
  type: "pushToken";
  token: string;
  deviceName: string;
  createdAt: string;
  lastSeenAt: string;
}

// What Expo issues: ExponentPushToken[...] (or ExpoPushToken[...]).
export function isExpoPushToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,}\]$/.test(token);
}

export async function savePushToken(email: string, token: string, deviceName: string): Promise<void> {
  const now = new Date().toISOString();
  const container = getContainer();
  const id = hashToken(token);
  let createdAt = now;
  try {
    const { resource } = await container.item(id, email).read<PushTokenDoc>();
    if (resource?.createdAt) createdAt = resource.createdAt;
  } catch {
    // New phone.
  }
  await container.items.upsert({ id, pk: email, type: "pushToken", token, deviceName: deviceName.slice(0, 60) || "Phone", createdAt, lastSeenAt: now } satisfies PushTokenDoc);
}

export async function removePushToken(email: string, token: string): Promise<void> {
  try {
    await getContainer().item(hashToken(token), email).delete();
  } catch {
    // Already gone.
  }
}

export async function getPushTokens(email: string): Promise<string[]> {
  const { resources } = await getContainer()
    .items.query<{ token: string }>({ query: "SELECT c.token FROM c WHERE c.type = 'pushToken'" }, { partitionKey: email })
    .fetchAll();
  return resources.map((r) => r.token);
}
