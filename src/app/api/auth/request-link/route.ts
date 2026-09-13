// Place at: src/app/api/auth/request-link/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getContainer } from "@/lib/cosmos";
import { generateToken, encodeEmail } from "@/lib/auth/crypto";
import { sendMagicLinkEmail } from "@/lib/resend";
import { createSessionForEmail } from "@/lib/auth/session";
import { getSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { demoBikeExists, runDemoSeed } from "@/lib/tracker/demoSeedRunner";
import { isAccountBlocked } from "@/lib/tracker/userDoc";

const RATE_LIMIT_MS = 60_000;
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

// Cosmos-backed rather than an in-process Map - a Map only rate-limits
// within one server instance, and resets on every cold start, both of
// which are real gaps on Azure App Service. Reuses the magicLink docs
// already written below rather than a second doc type just for this -
// one query for "was a link requested for this email in the last
// minute", scoped to the same partition every other query for this
// email already uses.
async function isRateLimited(container: ReturnType<typeof getContainer>, email: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT TOP 1 c.id FROM c WHERE c.type = 'magicLink' AND c.createdAt > @cutoff",
        parameters: [{ name: "@cutoff", value: cutoff }],
      },
      { partitionKey: email }
    )
    .fetchAll();
  return resources.length > 0;
}

// The per-email cooldown above only ever throttles requests for the
// SAME target email - it does nothing to stop a script from requesting
// a link for a large number of DISTINCT emails (using this app's own
// transactional mailer as a spam/email-bombing relay), since each one
// individually stays under that limit. A per-IP ceiling closes that gap,
// same one-document-per-attempt, Cosmos-ttl-expired pattern
// twoFactor.ts's checkTotpRateLimit/recordTotpAttempt already use for an
// analogous "many attempts, one identity" budget. Generous on purpose -
// a shared office/cafe IP legitimately requesting several real accounts'
// links shouldn't be blocked, but a scripted burst against thousands of
// addresses will hit this fast.
const IP_RATE_LIMIT_WINDOW_SECONDS = 15 * 60;
const IP_RATE_LIMIT_MAX_ATTEMPTS = 20;

function ipAttemptPrefix(ip: string): string {
  return `magic-link-ip-attempt:${ip}:`;
}

async function isIpRateLimited(container: ReturnType<typeof getContainer>, ip: string): Promise<boolean> {
  // Can't rate-limit an identity we can't actually distinguish - fails
  // open here rather than accidentally throttling every "unknown-ip"
  // request as if it were the same one caller.
  if (ip === "unknown") return false;
  const { resources } = await container.items
    .query<{ id: string }>(
      {
        query: "SELECT c.id FROM c WHERE c.type = 'magicLinkIpAttempt' AND STARTSWITH(c.id, @prefix)",
        parameters: [{ name: "@prefix", value: ipAttemptPrefix(ip) }],
      },
      { partitionKey: `ip:${ip}` }
    )
    .fetchAll();
  return resources.length >= IP_RATE_LIMIT_MAX_ATTEMPTS;
}

async function recordIpAttempt(container: ReturnType<typeof getContainer>, ip: string): Promise<void> {
  if (ip === "unknown") return;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await container.items.create({
    id: `${ipAttemptPrefix(ip)}${suffix}`,
    pk: `ip:${ip}`,
    type: "magicLinkIpAttempt",
    createdAt: new Date().toISOString(),
    ttl: IP_RATE_LIMIT_WINDOW_SECONDS,
  });
}

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
  const { email, redirect } = await req.json();

  if (!email || typeof email !== "string" || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();
  // Validated once here, and again in the verify route once the link is
  // actually clicked - see safeRedirect.ts for why it isn't trusted
  // just because it passed this first check.
  const safeRedirect = getSafeRedirectPath(redirect);

  const ip = getClientIp(req);
  if (await isIpRateLimited(container, ip)) {
    return NextResponse.json({ error: "Too many attempts. Please wait and try again." }, { status: 429 });
  }
  await recordIpAttempt(container, ip);

  // Checked before either branch below - a blocked account can't get
  // back in at all, not even the demo bypass. getSession() also checks
  // this independently (so an already-active session dies immediately
  // once blocked), but rejecting here too means a blocked person never
  // gets a working session in the first place, rather than one that
  // silently no-ops everywhere.
  if (await isAccountBlocked(normalizedEmail)) {
    return NextResponse.json({ error: "This account is no longer able to sign in." }, { status: 403 });
  }

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
    const { cookieValue, maxAge } = await createSessionForEmail(DEMO_EMAIL, ip, req.headers.get("user-agent") ?? "unknown");
    // No emailed link in this branch - the client redirects immediately
    // on its own, so the safe destination is handed back directly
    // rather than baked into a URL.
    const response = NextResponse.json({ ok: true, demo: true, redirect: safeRedirect });
    response.cookies.set("session", cookieValue, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge,
    });
    return response;
  }

  if (await isRateLimited(container, normalizedEmail)) {
    return NextResponse.json(
      { error: "Please wait a moment before requesting another link" },
      { status: 429 }
    );
  }

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
  )}${safeRedirect ? `&redirect=${encodeURIComponent(safeRedirect)}` : ""}`;

  await sendMagicLinkEmail(normalizedEmail, link);

  return NextResponse.json({ ok: true });
}
