// Place at: src/app/api/auth/request-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { generateToken, encodeEmail } from "@/lib/auth/crypto";
import { sendMagicLinkEmail } from "@/lib/resend";

const lastRequestByEmail = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export async function POST(req: NextRequest) {
  const container = getContainer();
  const { email } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const lastRequest = lastRequestByEmail.get(normalizedEmail);
  if (lastRequest && Date.now() - lastRequest < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Please wait a moment before requesting another link" },
      { status: 429 }
    );
  }
  lastRequestByEmail.set(normalizedEmail, Date.now());

  const { raw, hash } = generateToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_SECONDS * 1000);

  await container.items.create({
    id: hash,
    pk: normalizedEmail,
    type: "magicLink",
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    used: false,
    ttl: MAGIC_LINK_TTL_SECONDS,
  });

  const link = `${process.env.APP_URL}/api/auth/verify?token=${raw}&e=${encodeEmail(
    normalizedEmail
  )}`;

  await sendMagicLinkEmail(normalizedEmail, link);

  return NextResponse.json({ ok: true });
}
