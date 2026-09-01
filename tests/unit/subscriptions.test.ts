// Place at: tests/unit/subscriptions.test.ts
//
// subscriptions.ts is almost entirely static pricing/feature copy (left
// untested here, per this repo's convention of not padding tests around
// content with no logic - see modTypes.ts for the same pattern). isPro
// is the one real function, and the only actual gate every Pro-only
// feature in the app calls through - currently a deliberate stub that
// always returns false until Stripe is wired up. Pinned here so a future
// change to its return value only happens on purpose.
import { describe, expect, it } from "vitest";
import { isPro } from "@/lib/subscriptions";

describe("isPro", () => {
  it("returns false for a normal account email", async () => {
    await expect(isPro("rider@example.com")).resolves.toBe(false);
  });

  it("returns false regardless of which email is passed - no account is special-cased in the current stub", async () => {
    await expect(isPro("someone-else@example.com")).resolves.toBe(false);
  });

  it("never throws on unusual input, since every caller awaits this directly inline in a render/gate path", async () => {
    await expect(isPro("")).resolves.toBe(false);
  });
});
