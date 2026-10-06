import { expect, test, type Page } from "@playwright/test";

/**
 * The full expedition loop a first-run user walks: onboarding → start an
 * expedition → work a mission → capture a note → wrap up → deterministic
 * Grass Score → journal. Every step runs against the real stores and the real
 * offline-capable engines; nothing is stubbed.
 */

/** The curiosity sheet opens only when the rules engine finds a candidate. */
async function dismissCuriosityIfShown(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "Follow the curiosity" });
  const appeared = await dialog
    .waitFor({ state: "visible", timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  if (appeared) {
    await dialog.getByRole("button", { name: "Not now" }).click();
  }
}

test("a first-run user can walk the whole loop", async ({ page }) => {
  await page.goto("/");

  // Landing → the app. The onboarding guard takes over from here.
  // Hero and bottom CTA both say START EXPLORING — either one leads to /home.
  await page.getByRole("link", { name: "START EXPLORING" }).first().click();
  await page.waitForURL("**/onboarding");

  // Onboarding: name, then straight through the five steps.
  await page.locator("#onb-name").fill("Field Tester");
  for (let step = 0; step < 4; step += 1) {
    await page.getByRole("button", { name: "Continue" }).click();
  }
  await page.getByRole("button", { name: "Start exploring" }).click();
  await page.waitForURL("**/home");

  // Home → new expedition → start.
  await page.getByRole("link", { name: "Start an expedition" }).click();
  await page.waitForURL("**/expeditions/new");
  await page.getByRole("button", { name: "Start expedition" }).click();
  await page.waitForURL(/\/expeditions\/[0-9a-f-]+$/);

  // Work the first mission: activate, attach evidence, complete.
  await page.getByRole("button", { name: "Start this mission" }).click();
  await page.getByRole("button", { name: "Capture evidence" }).click();
  await page.getByRole("tab", { name: "Note" }).click();
  await page
    .locator("#capture-note")
    .fill("A grey squirrel burying acorns under the old oak by the path.");
  await page.getByRole("button", { name: "Save note" }).click();

  await dismissCuriosityIfShown(page);

  await expect(page.getByRole("heading", { name: /What you found/ })).toContainText("(1)");

  await page.getByRole("button", { name: "Mark done" }).click();
  // Completing a mission unlocks the next one on the board.
  await expect(page.getByRole("button", { name: "Start this mission" })).toBeVisible();

  // Wrap up → the deterministic score.
  await page.getByRole("button", { name: "Wrap up" }).click();
  await page.getByRole("button", { name: "Finish & see my score" }).click();
  await expect(page.getByText("Expedition complete")).toBeVisible();
  await expect(page.getByText("Expedition score")).toBeVisible();

  // The loop closes in the journal.
  await page.getByRole("link", { name: "Back to journal" }).click();
  await page.waitForURL("**/journal");
  await expect(page.getByRole("heading", { name: "Journal" })).toBeVisible();
});
