// Place at: tests/e2e/authenticated-demo-journey.spec.ts
//
// Authenticated journeys through the real app, using the demo account
// (see helpers/demoAuth.ts). Unlike public-smoke.spec.ts, these drive
// real forms against a real backend and prove the UI and backend
// actually wire together - something unit, API-contract, and component
// tests (which mock the boundary between them) can't prove on their own.
//
// Runs serially and shares no browser state between tests (each test
// signs in independently, cheaply, since the demo bypass has no real
// email round-trip) - but all tests DO share the same underlying demo
// account data in the backend, so ordering matters.
//
// The reset-button test runs LAST on purpose, not first. Every real CI
// run against the Linux Cosmos DB Emulator so far has crashed the
// container at the same point: right after two full sequential ~150-
// document demo-seed writes (auto-seed-on-first-login, immediately
// followed by the reset button re-seeding again) landed back-to-back on
// a container that had only just started. The very first login of this
// file already triggers one full auto-seed cycle on its own - that
// alone is a legitimate, deterministic starting point for the tests
// that don't care about the reset button specifically, so they don't
// need to wait for it. Deferring the second, redundant seed burst until
// after the container/app have already handled a couple of lighter
// round-trips is a cheap way to stop stacking two heavy write bursts at
// the most fragile point in the emulator's lifetime.
import { test, expect } from "@playwright/test";
import { loginAsDemo, resetDemoAccount, DEMO_REGISTRATION, DEMO_NICKNAME } from "./helpers/demoAuth";

test.describe.configure({ mode: "serial", timeout: 60_000 });

test.describe("Authenticated demo journeys", () => {
  test("logs a new fuel fill-up through the real form and sees it reflected in fuel history", async ({ page }) => {
    await loginAsDemo(page);
    await page.getByRole("button", { name: "Fuel" }).click();

    const today = new Date().toISOString().slice(0, 10);
    await page.getByLabel("Date").fill(today);
    await page.getByLabel("Litres added").fill("12.5");
    await page.getByLabel(/Cost paid/).fill("18.20");
    // Leave mileage at its prefilled current-mileage default - it's
    // already valid and this journey isn't testing mileage-conflict
    // handling (that's covered at the unit/component level already).
    await page.getByRole("button", { name: "Log it" }).click();

    // The form resets its litres/cost fields on a successful submit -
    // itself proof the request round-tripped and was accepted, before
    // even checking the record shows up in the list below.
    await expect(page.getByLabel("Litres added")).toHaveValue("");
    // £18.20 / 12.5 litres = a real, specific £1.46/litre unit price the
    // card computes and displays - unique enough to the entry just
    // logged that matching this alone is enough, without fighting
    // Playwright's text-node matching across the rest of the card.
    await expect(page.getByText("£1.46/litre").first()).toBeVisible();
  });

  test("creates a shareable report link, and an anonymous visitor only sees the report after confirming the real registration", async ({ page, browser }) => {
    await loginAsDemo(page);
    await page.getByRole("button", { name: "Shareable Links" }).click();

    await page.getByLabel(/Sharing with/).fill("buyer@example.com");
    await page.getByRole("button", { name: "Get shareable report link" }).click();

    const shareUrlInput = page.locator("input[readonly]");
    await expect(shareUrlInput).toBeVisible();
    const shareUrl = await shareUrlInput.inputValue();
    expect(shareUrl).toContain("/report/");

    // A fresh, fully unauthenticated browser context - no session
    // cookie, no plate-gate cookie either. Exactly what a buyer clicking
    // an emailed link for the first time actually has.
    const anonContext = await browser.newContext();
    const anonPage = await anonContext.newPage();
    try {
      await anonPage.goto(shareUrl);
      await expect(anonPage.getByRole("heading", { name: "Confirm you have the right bike" })).toBeVisible();

      await anonPage.getByPlaceholder("e.g. AB12 CDE").fill("WRONG PLATE");
      await anonPage.getByRole("button", { name: "View report" }).click();
      await expect(anonPage.getByRole("alert")).toBeVisible();
      // Still gated - a wrong plate must never grant access.
      await expect(anonPage.getByRole("heading", { name: "Confirm you have the right bike" })).toBeVisible();

      await anonPage.getByPlaceholder("e.g. AB12 CDE").fill(DEMO_REGISTRATION);
      await anonPage.getByRole("button", { name: "View report" }).click();

      await expect(anonPage.getByRole("heading", { name: "Confirm you have the right bike" })).not.toBeVisible();
      await expect(anonPage.getByRole("heading", { name: /MT-07/ })).toBeVisible();
    } finally {
      await anonContext.close();
    }
  });

  test("signs in via the real login form, resets the demo account, and lands back on a freshly seeded dashboard", async ({ page }) => {
    await loginAsDemo(page);
    await resetDemoAccount(page);
    // Re-confirm the bike is still there (and correctly re-seeded, not
    // just "not crashed") after the reset.
    await expect(page.getByText(DEMO_NICKNAME).first()).toBeVisible();
  });
});
