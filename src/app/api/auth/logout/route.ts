// Place at: src/app/api/auth/logout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { hashToken, decodeEmail } from "@/lib/auth/crypto";

export async function POST(req: NextRequest) {
  const container = getContainer();
  const raw = req.cookies.get("session")?.value;

  if (raw) {
    const [encodedEmail, sessionRaw] = raw.split(".");
    if (encodedEmail && sessionRaw) {
      const email = decodeEmail(encodedEmail);
      const sessionHash = hashToken(sessionRaw);
      try {
        await container.item(sessionHash, email).delete();
      } catch {
        // Already gone - nothing to clean up.
      }
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete("session");
  return response;
}
