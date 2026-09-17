// Place at: src/app/api/onboarding/complete/route.ts
//
// Only for the steps that have no natural server-side success path of
// their own to hook into (viewing a tab, opening a section) - see
// OnboardingStepSeen.tsx, mounted once on StorySoFarTab/
// CarStorySoFarTab (viewed-report) and TransferOwnershipSection/
// CarTransferOwnershipSection (explored-transfer). Every other step
// (logged-first-entry, used-ai-assistant, created-share-link,
// compared-vehicles) is marked directly inside the route/page that
// already proves the real action happened, never through this endpoint.
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { markOnboardingStepComplete } from "@/lib/tracker/userAccount";
import { ONBOARDING_STEPS, type OnboardingStep } from "@/lib/tracker/userDoc";

export const dynamic = "force-dynamic";

const CLIENT_TRIGGERABLE_STEPS = new Set<OnboardingStep>(["viewed-report", "explored-transfer"]);

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { step } = body as { step?: string };
  const isValidStep = ONBOARDING_STEPS.some((s) => s.step === step) && CLIENT_TRIGGERABLE_STEPS.has(step as OnboardingStep);
  if (!isValidStep) {
    return NextResponse.json({ error: "Unknown onboarding step." }, { status: 400 });
  }

  await markOnboardingStepComplete(session.email, step as OnboardingStep);
  return NextResponse.json({ ok: true });
}
