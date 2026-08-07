// Place at: src/app/api/auth/request-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { generateToken, encodeEmail } from "@/lib/auth/crypto";
import { sendMagicLinkEmail } from "@/lib/resend";
import { createSessionForEmail } from "@/lib/auth/session";
import { demoBikeExists, runDemoSeed } from "@/lib/tracker/demoSeedRunner";

const lastRequestByEmail = new Map<string, number>();
const RATE_LIMIT_MS = 60_000;
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

// Exact, hardcoded, case-normalised match only - deliberately not a
// pattern, a prefix check, or anything derived from user input. This is
// the one email address in the entire app that skips real verification,
// so it has to be impossible to accidentally widen.
const DEMO_EMAIL = "demo@roadverdict.co.uk";

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function POST(req: NextRequest) {
  const container = getContainer();
  const { email } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (normalizedEmail === DEMO_EMAIL) {
    const alreadySeeded = await demoBikeExists();
    if (!alreadySeeded) {
      try {
        await runDemoSeed();
      } catch {
        // If seeding fails, still let the person in - an empty demo
        // dashboard with a working "Reset Demo" button to try again beats
        // refusing to sign in at all.
      }
    }
    const { cookieValue, maxAge } = await createSessionForEmail(DEMO_EMAIL, getClientIp(req));
    const response = NextResponse.json({ ok: true, demo: true });
    response.cookies.set("session", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return response;
  }

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

  const link = `${process.env.APP_URL ?? "https://roadverdict.co.uk"}/api/auth/verify?token=${raw}&e=${encodeEmail(
    normalizedEmail
  )}`;

  await sendMagicLinkEmail(normalizedEmail, link);

  return NextResponse.json({ ok: true });
}
