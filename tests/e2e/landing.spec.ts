import { expect, test } from "@playwright/test";

/**
 * The public face: the landing promise and the pages a judge opens first.
 * Copy here is asserted verbatim so a rewrite of the pitch is a conscious
 * choice, not a silent regression.
 */

test("landing states the promise and links the public pages", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("AI that sends you outside.");
  // Hero and bottom CTA both say START EXPLORING — asserting the hero one.
  await expect(page.getByRole("link", { name: "START EXPLORING" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start with judge mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Try the demo" })).toBeVisible();
});

test("judge mode lists its checks", async ({ page }) => {
  await page.goto("/judge");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "The whole project in ten checks."
  );
});

test("open-AI story is public", async ({ page }) => {
  await page.goto("/open");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("A lens you can take apart.");
});

test("privacy page is specific", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your walk is yours.");
});

test("offline fallback is honest", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("You're offline");
});
