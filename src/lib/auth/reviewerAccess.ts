// Place at: src/lib/auth/reviewerAccess.ts
//
// Sign-in for app store reviewers. Google and Apple must be able to sign
// in to review the app, but signing in here means a code sent by email,
// which a reviewer can't receive. So the demo account
// (demo@roadverdict.co.uk, which holds only made-up demo data) can be
// opened with a fixed 6-digit code: the admin turns it on in /tomasz, sees
// the code once, and pastes it into Play Console and App Store Connect.
//
// It works only for that one address, only in the app's code sign-in
// (api/auth/app/verify-code), and only while it's switched on - switching
// it off deletes the code, and switching it on again makes a new one.
// Wrong guesses count towards the same lockout as any other app code.
// Only the code's hash is stored.
import { randomInt, timingSafeEqual } from "crypto";
import { getContainer } from "@/lib/cosmos";
import { hashToken } from "@/lib/auth/crypto";
import { DEMO_EMAIL } from "@/lib/tracker/demoSeed";

const DOC_ID = "reviewerAccess";
const PK = "system";

type ReviewerAccessDoc = { id: string; pk: string; type: "reviewerAccess"; codeHash: string; enabledAt: string };

export const REVIEWER_EMAIL = DEMO_EMAIL;

function hashCode(code: string): string {
  return hashToken(`reviewer-access:${code}`);
}

async function readDoc(): Promise<ReviewerAccessDoc | null> {
  try {
    const { resource } = await getContainer().item(DOC_ID, PK).read<ReviewerAccessDoc>();
    return resource ?? null;
  } catch (err) {
    if ((err as { code?: number }).code === 404) return null;
    throw err;
  }
}

// Null while switched off.
export async function getReviewerAccess(): Promise<{ enabledAt: string } | null> {
  const doc = await readDoc();
  return doc ? { enabledAt: doc.enabledAt } : null;
}

// Switches it on with a brand-new code, returned this once only.
export async function enableReviewerAccess(): Promise<{ code: string; enabledAt: string }> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const enabledAt = new Date().toISOString();
  const doc: ReviewerAccessDoc = { id: DOC_ID, pk: PK, type: "reviewerAccess", codeHash: hashCode(code), enabledAt };
  await getContainer().items.upsert(doc);
  return { code, enabledAt };
}

export async function disableReviewerAccess(): Promise<void> {
  try {
    await getContainer().item(DOC_ID, PK).delete();
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
  }
}

export async function isReviewerCode(email: string, code: string): Promise<boolean> {
  if (email !== REVIEWER_EMAIL) return false;
  const doc = await readDoc();
  if (!doc) return false;
  const expected = Buffer.from(doc.codeHash, "hex");
  const actual = Buffer.from(hashCode(code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
