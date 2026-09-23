// Place at: tests/e2e/helpers/demoAuth.ts
//
// The demo account (demo@roadverdict.co.uk) is a real, designed-for-this
// sandbox: signing in as it bypasses the real magic-link email entirely
// (see src/app/api/auth/request-link/route.ts's DEMO_EMAIL branch) and
// auto-seeds a real 10-year dataset the first time it's used. This is
// what makes authenticated E2E possible at all without a second mailbox
// to poll - every journey here signs in through the real login form,
// exactly as a person would, and the app's own demo bypass takes it from
// there.
import { expect, type Page } from "@playwright/test";

export const DEMO_EMAIL = "demo@roadverdict.co.uk";
export const DEMO_REGISTRATION = "YA16 MTO";
export const DEMO_NICKNAME = "Demo MT-07";

// The FIRST call to this helper in a given run doesn't just sign in - it
// also triggers a full, deliberately-sequential ~360-write demo reseed
// inline (see request-link/route.ts's DEMO_EMAIL branch), the exact same
// real Cosmos work resetDemoAccount below explicitly budgets 60s for.
// This waitForURL had no equivalent override before - it only had
// whatever was left of the surrounding test's own timeout, which proved
// too tight under real-world RU jitter on the shared CI test account
// (two independent failures here, on two different "first" tests,
// before this was added). Same reasoning as resetDemoAccount's own
// comment: this is deliberately generous rather than tuned to the
// happy-path duration, since ordinary Cosmos jitter is a real cost here,
// not a bug to chase.
export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(DEMO_EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 75_000 });
  await expect(page.getByText(DEMO_NICKNAME).first()).toBeVisible();
}

// Rebuilds the demo account back to its original, known dataset -
// discarding anything an earlier test run (or a real visitor trying the
// live demo) left behind. Call this first in any suite that needs a
// deterministic starting point. Accepts the native confirm() dialog the
// button raises, and waits for the resetting-in-progress button label to
// clear before continuing, since the reset itself is a real, sequential
// multi-write Cosmos operation (~360 individual round trips by design -
// see demoSeedRunner.ts's own comment on why it isn't batched), not
// instant. 30s proved too tight against CI's real Azure Cosmos DB
// account (not the old local emulator), then 60s also failed under a
// heavier CI run (fresh Playwright/Chromium install right before the
// test) - ordinary network jitter or a round of RU throttling can push
// this well past either, with no actual problem, so this is deliberately
// generous rather than tuned to the happy-path duration.
export async function resetDemoAccount(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "↺ Reset Demo" }).first().click();
  await expect(page.getByRole("button", { name: "Resetting…" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "↺ Reset Demo" }).first()).toBeVisible({ timeout: 120_000 });
}
