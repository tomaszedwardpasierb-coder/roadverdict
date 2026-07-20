// Place at: src/lib/tracker/shareLink.ts
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { getBike, updateBikeShareToken } from "./bike";

export interface ShareLinkDoc {
  id: string;
  pk: string;
  type: "shareLink";
  email: string;
  createdAt: string;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Reuses the same token every time once created, rather than generating
// a new one per request - so a link shared once keeps working.
export async function getOrCreateShareToken(email: string): Promise<string> {
  const bike = await getBike(email);
  if (bike?.shareToken) return bike.shareToken;

  const token = generateToken();
  const container = getContainer();
  const doc: ShareLinkDoc = {
    id: token,
    pk: token,
    type: "shareLink",
    email,
    createdAt: new Date().toISOString(),
  };
  await container.items.upsert(doc);
  await updateBikeShareToken(email, token);
  return token;
}

// Cheap point-read, not a search - the token itself is both the id and
// the partition key, so resolving it never needs a cross-partition query.
export async function resolveShareToken(token: string): Promise<string | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<ShareLinkDoc>();
    return resource?.email ?? null;
  } catch {
    return null;
  }
}
