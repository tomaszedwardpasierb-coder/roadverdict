import { test, expect } from "@playwright/test";

test("public quote checker is reachable", async ({ page }) => {
  await page.goto("/quote-checker");
  await expect(page).toHaveTitle(/RoadVerdict/i);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("public buying guide is reachable", async ({ page }) => {
  await page.goto("/buying-guide");
  await expect(page).toHaveTitle(/RoadVerdict/i);
  await expect(page.getByRole("heading").first()).toBeVisible();
});