// Place at: src/lib/proPlan.ts
//
// Pure, Cosmos-free Pro plan display constants - split out of
// subscriptions.ts specifically so client components (PlanComparisonCards,
// ProCheckoutButtons, rendered from the client-side ProGate) can show the
// price/feature list without importing subscriptions.ts itself, which
// pulls in userDoc.ts -> cosmos.ts -> the @azure/cosmos SDK (plus its own
// sizeable dependency tree). That leak was confirmed via PageSpeed
// Insights: /pro, /dashboard, and /garage/compare's client bundles were
// each shipping ~275KB of Azure SDK/crypto code to every visitor's
// browser, entirely unused there, just for these two price strings and
// one feature-list array.
export const PRO_MONTHLY_PRICE = "£5.99";
export const PRO_ANNUAL_PRICE = "£59";
export const PRO_ANNUAL_MONTHLY_EQUIV = "£4.92";

// Ordered to lead with the perks nothing else in this category does well
// (the Vault, the richer verdict/story reporting, AI chat-drafting) rather
// than vehicle capacity - a second vehicle is a genuine perk, but it's the
// one entitlement here that's trivially comparable to a rival's own stated
// vehicle limit, which is exactly the wrong thing to lead with for an
// unbranded product. CSV export deliberately isn't listed here - it isn't
// Pro-gated (see export/csv/route.ts), so it belongs on the Free card
// instead; it used to be listed here by mistake.
export const PRO_FEATURES = [
  "The Vault - encrypted, 2FA-protected document storage for your V5C, insurance, MOT, and everything else you'd hate to lose",
  "Detailed buyer/seller verdict report",
  "AI-generated \"Story So Far\" summary",
  "Draft new log entries just by describing them to the AI assistant in chat - service, fuel, bills, mods, labour, fines & tolls",
  "Full Reports - fuel economy, running costs, and spend trends over time",
  "Category-by-category spend breakdown (which category, and how much)",
  "Batch receipt scanning (multiple files at once)",
  "Exact reminder due dates, plus automatic reminder emails",
  "One free Buying Guide vehicle-history report every 4 weeks (£9.99 for another sooner)",
  "Quote Checker, Cost Calculator & Buying Guide, pre-filled with your bike's own details",
  "A second vehicle (bike or car) - with side-by-side cost comparison to see which one actually costs you more to run",
] as const;
