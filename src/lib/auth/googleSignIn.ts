// Place at: src/lib/auth/googleSignIn.ts
//
// "Continue with Google", on the website and in the Android app. Google
// only tells us one thing we use: an email address it has verified. That
// email is the account - the same one a magic link or app code would sign
// in to - so a person who signed up by email and later taps Google lands
// in the same logbook. Everything after that (blocked accounts, 2FA, the
// session itself) is the existing sign-in path.
//
// Off until GOOGLE_OAUTH_CLIENT_ID is set (and, for the website's redirect
// flow, GOOGLE_OAUTH_CLIENT_SECRET): the buttons hide themselves and the
// routes refuse.
//
// The ID token is checked by hand with Node's crypto (RS256 against
// Google's published keys) rather than adding a library for one call.
import { createHash, createPublicKey, randomBytes, verify as verifySignature, type JsonWebKey } from "crypto";
import { fetchWithTimeout } from "@/lib/fetchWithTimeout";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
// Google rotates its keys every few days and publishes the next one early,
// so an hour's cache is safe; an unknown key id forces a refetch anyway.
const JWKS_CACHE_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

export function googleClientId(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || null;
}

function googleClientSecret(): string | null {
  return process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || null;
}

// The website needs both halves (it swaps a code for a token); the app
// only needs the client id, which its ID tokens are issued for.
export function googleWebSignInEnabled(): boolean {
  return !!googleClientId() && !!googleClientSecret();
}

export function googleAppSignInEnabled(): boolean {
  return !!googleClientId();
}

export function googleRedirectUri(appUrl: string): string {
  return `${appUrl}/api/auth/google/callback`;
}

// ── The website's redirect flow ──────────────────────────────────────
// state (CSRF), nonce (binds the ID token to this attempt) and a PKCE
// verifier, kept in a short-lived httpOnly cookie between the two legs.

export const GOOGLE_ATTEMPT_COOKIE = "google_signin";

export type GoogleAttempt ={ state: string; nonce: string; verifier: string; redirect: string | null; src: string | null };

export function newGoogleAttempt(redirect: string | null, src: string | null): GoogleAttempt {
  const token = () => randomBytes(32).toString("base64url");
  return { state: token(), nonce: token(), verifier: token(), redirect, src };
}

export function googleAuthUrl(attempt: GoogleAttempt, redirectUri: string): string {
  const clientId = googleClientId();
  if (!clientId) throw new Error("Google sign-in isn't configured");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email",
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export function encodeAttempt(attempt: GoogleAttempt): string {
  return Buffer.from(JSON.stringify(attempt)).toString("base64url");
}

export function decodeAttempt(value: string | undefined): GoogleAttempt | null {
  if (!value) return null;
  try {
    const a = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GoogleAttempt>;
    if (typeof a.state !== "string" || typeof a.nonce !== "string" || typeof a.verifier !== "string") return null;
    return {
      state: a.state,
      nonce: a.nonce,
      verifier: a.verifier,
      redirect: typeof a.redirect === "string" ? a.redirect : null,
      src: typeof a.src === "string" ? a.src : null,
    };
  } catch {
    return null;
  }
}

// Returns the ID token from Google's token endpoint, or null on any failure.
export async function exchangeCode(code: string, verifier: string, redirectUri: string): Promise<string | null> {
  const clientId = googleClientId();
  const clientSecret = googleClientSecret();
  if (!clientId || !clientSecret) return null;
  try {
    const res = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }).toString(),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id_token?: unknown };
    return typeof data.id_token === "string" ? data.id_token : null;
  } catch {
    return null;
  }
}

// ── ID token check ───────────────────────────────────────────────────

type GoogleJwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: GoogleJwk[]; fetchedAt: number } | null = null;

async function googleKeys(forceRefresh: boolean): Promise<GoogleJwk[]> {
  if (!forceRefresh && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_CACHE_MS) return jwksCache.keys;
  const res = await fetchWithTimeout(GOOGLE_JWKS_URL, {});
  if (!res.ok) throw new Error(`Google keys: ${res.status}`);
  const data = (await res.json()) as { keys?: GoogleJwk[] };
  jwksCache = { keys: Array.isArray(data.keys) ? data.keys : [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

// Test hook: forget the cached keys.
export function resetGoogleKeyCache(): void {
  jwksCache = null;
}

function decodePart<T>(part: string): T | null {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

// The verified, lower-cased email from a Google ID token, or null if the
// token is forged, expired, meant for another app, for another sign-in
// attempt (nonce), or carries an email Google hasn't verified.
export async function verifyGoogleIdToken(idToken: string, options: { nonce?: string; now?: Date } = {}): Promise<string | null> {
  const clientId = googleClientId();
  if (!clientId) return null;
  const parts = idToken.split(".");
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodePart<{ alg?: string; kid?: string }>(headerPart);
  const payload = decodePart<{
    iss?: string;
    aud?: string | string[];
    exp?: number;
    iat?: number;
    nonce?: string;
    email?: string;
    email_verified?: boolean | string;
  }>(payloadPart);
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;

  let keys: GoogleJwk[];
  try {
    keys = await googleKeys(false);
    if (!keys.some((k) => k.kid === header.kid)) keys = await googleKeys(true);
  } catch {
    return null;
  }
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  let signatureOk = false;
  try {
    const key = createPublicKey({ key: jwk, format: "jwk" });
    signatureOk = verifySignature("RSA-SHA256", Buffer.from(`${headerPart}.${payloadPart}`), key, Buffer.from(signaturePart, "base64url"));
  } catch {
    return null;
  }
  if (!signatureOk) return null;

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return null;
  if (!audiences.includes(clientId)) return null;
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < nowSeconds) return null;
  if (typeof payload.iat === "number" && payload.iat - CLOCK_SKEW_SECONDS > nowSeconds) return null;
  if (options.nonce !== undefined && payload.nonce !== options.nonce) return null;
  if (payload.email_verified !== true && payload.email_verified !== "true") return null;
  if (typeof payload.email !== "string" || !payload.email.includes("@")) return null;
  return payload.email.toLowerCase().trim();
}
