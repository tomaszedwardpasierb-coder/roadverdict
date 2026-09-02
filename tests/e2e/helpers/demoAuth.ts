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

export async function loginAsDemo(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(DEMO_EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.waitForURL(/\/dashboard/);
  await expect(page.getByText(DEMO_NICKNAME).first()).toBeVisible();
}

// Rebuilds the demo account back to its original, known dataset -
// discarding anything an earlier test run (or a real visitor trying the
// live demo) left behind. Call this first in any suite that needs a
// deterministic starting point. Accepts the native confirm() dialog the
// button raises, and waits for the resetting-in-progress button label to
// clear before continuing, since the reset itself is a real, sequential
// multi-write Cosmos operation, not instant.
export async function resetDemoAccount(page: Page): Promise<void> {
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "↺ Reset Demo" }).first().click();
  await expect(page.getByRole("button", { name: "Resetting…" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "↺ Reset Demo" }).first()).toBeVisible({ timeout: 30_000 });
}
