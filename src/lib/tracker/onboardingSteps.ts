// Place at: src/lib/tracker/onboardingSteps.ts
//
// Pure, Cosmos-free onboarding-step catalog - split out of userDoc.ts
// specifically so client components (OnboardingChecklistCard,
// OnboardingStepSeen) can read the step list/copy without importing
// userDoc.ts itself, which imports @/lib/cosmos and therefore the whole
// @azure/cosmos SDK into the client bundle. Confirmed via PageSpeed
// Insights alongside the identical proPlan.ts leak - see its comment.
export type OnboardingStep =
  | "logged-first-entry"
  | "used-ai-assistant"
  | "compared-vehicles"
  | "created-share-link"
  | "viewed-report"
  | "explored-transfer";

// Display order and copy for OnboardingChecklistCard.tsx - one place so
// the card's rendering never has to know the step keys' own meaning.
export const ONBOARDING_STEPS: { step: OnboardingStep; label: string; href: string }[] = [
  { step: "logged-first-entry", label: "Log your first bit of history", href: "/dashboard?tab=service" },
  { step: "viewed-report", label: "Check your own report", href: "/dashboard?tab=story" },
  { step: "created-share-link", label: "See what a buyer would see", href: "/dashboard?tab=shareLinks" },
  { step: "used-ai-assistant", label: "Ask the AI assistant something", href: "/dashboard" },
  { step: "compared-vehicles", label: "Compare two vehicles", href: "/garage/compare" },
  { step: "explored-transfer", label: "See how transferring ownership works", href: "/dashboard?tab=transferOwnership" },
];
