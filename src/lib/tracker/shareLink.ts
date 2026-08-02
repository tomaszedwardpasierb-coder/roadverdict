// Place at: src/lib/tracker/shareLink.ts
import crypto from "crypto";
import { getContainer } from "@/lib/cosmos";
import { getBike, updateBikeShareToken } from "./bike";

export interface ShareLinkDoc {
  id: string;
  pk: string;
  type: "shareLink";
  email: string;
  bikeId: string;
  createdAt: string;
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

// Reuses the same token every time once created, rather than generating
// a new one per request - so a link shared once keeps working. Scoped to
// one specific bike now, not just the account, since an account can have
// more than one.
export async function getOrCreateShareToken(email: string, bikeId: string): Promise<string> {
  const bike = await getBike(email, bikeId);
  if (bike?.shareToken) return bike.shareToken;

  const token = generateToken();
  const container = getContainer();
  const doc: ShareLinkDoc = {
    id: token,
    pk: token,
    type: "shareLink",
    email,
    bikeId,
    createdAt: new Date().toISOString(),
  };
  await container.items.upsert(doc);
  await updateBikeShareToken(email, bikeId, token);
  return token;
}

// Cheap point-read, not a search - the token itself is both the id and
// the partition key, so resolving it never needs a cross-partition query.
// Returns both email and bikeId now, so the report page knows exactly
// which bike this link was generated for, not just which account.
export async function resolveShareToken(token: string): Promise<{ email: string; bikeId: string } | null> {
  try {
    const container = getContainer();
    const { resource } = await container.item(token, token).read<ShareLinkDoc>();
    if (!resource) return null;
    return { email: resource.email, bikeId: resource.bikeId };
  } catch {
    return null;
  }
}
