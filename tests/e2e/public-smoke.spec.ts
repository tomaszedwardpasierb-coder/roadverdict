import { test, expect } from "@playwright/test";

// This runs right after a fresh deploy, against whatever App Service
// worker the deploy just restarted - measured locally, that first hit
// after a period of inactivity took 13-15s (vs. 3-4s on the very next
// one, once warm), borderline enough against Playwright's default 30s
// test timeout to tip over under CI's own network path. Two independent
// fixes for that: "domcontentloaded" instead of the default "load" -
// this test only needs to know the page is up and rendering, not that
// every font/analytics/image subresource has also finished; and a
// longer test timeout as headroom for the genuine cold-start cost
// itself, which no wait strategy removes. Neither changes what this
// actually proves - a failure here still means the deploy already
// happened (see this workflow's own comment on the step that runs
// this file), just that a slow first hit shouldn't be mistaken for one.
test.describe.configure({ timeout: 60_000 });

test("public quote checker is reachable", async ({ page }) => {
  await page.goto("/quote-checker", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/RoadVerdict/i);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("public buying guide is reachable", async ({ page }) => {
  await page.goto("/buying-guide", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/RoadVerdict/i);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("public cars landing page is reachable", async ({ page }) => {
  await page.goto("/cars", { waitUntil: "domcontentloaded" });
  await expect(page).toHaveTitle(/RoadVerdict/i);
  await expect(page.getByRole("heading").first()).toBeVisible();
});