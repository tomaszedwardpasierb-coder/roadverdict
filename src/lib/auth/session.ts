// Place at: src/lib/auth/session.ts
import { cookies } from "next/headers";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail } from "@/lib/auth/crypto";

export async function getSession(): Promise<{ email: string } | null> {
  const container = getContainer();
  const cookieStore = await cookies();
  const raw = cookieStore.get("session")?.value;
  if (!raw) return null;

  const [encodedEmail, sessionRaw] = raw.split(".");
  if (!encodedEmail || !sessionRaw) return null;

  const email = decodeEmail(encodedEmail);
  const sessionHash = hashToken(sessionRaw);

  try {
    const { resource } = await container.item(sessionHash, email).read();
    if (!resource || resource.type !== "session") return null;
    if (new Date(resource.expiresAt) < new Date()) return null;
    return { email };
  } catch {
    return null;
  }
}
