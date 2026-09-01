// Place at: src/lib/subscriptions.ts
//
// Single source of truth for plan checks throughout the app.
// Right now everyone is on the free plan - when Stripe is wired up,
// replace isPro() with a real DB/Stripe lookup. Nothing else in the app
// needs to change: every gate already calls this function.
//
// Future shape:
//   export async function isPro(email: string): Promise<boolean> {
//     const sub = await getSubscriptionForUser(email); // your Stripe check
//     return sub?.status === 'active';
//   }

export async function isPro(_email: string): Promise<boolean> {
  // TODO: replace with real Stripe subscription check
  return false;
}

export const PRO_MONTHLY_PRICE = "£4.99";
export const PRO_ANNUAL_PRICE = "£49";
export const PRO_ANNUAL_MONTHLY_EQUIV = "£4.08";

export const PRO_FEATURES = [
  "Additional bikes beyond your first",
  "Multi-bike overview and cost comparison",
  "AI-generated \"Story So Far\" summary",
  "Detailed buyer/seller verdict report",
  "Export your full history as CSV",
  "Batch receipt scanning (multiple files at once)",
  "Advanced cost trends and analytics",
] as const;
