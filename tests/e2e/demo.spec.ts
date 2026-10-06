import { expect, test } from "@playwright/test";

/**
 * The guided demo walks the same engines the app uses — missions, curiosity,
 * the analysis pipeline — on clearly marked fixtures. The last assertion is
 * the important one: whatever the pipeline answers, the page must show a real
 * outcome (a result or a typed unavailable state), never an invented one.
 */

test("the guided demo runs the real engines on marked fixtures", async ({ page }) => {
  await page.goto("/demo");

  await expect(page.getByText("DEMO DATA — structurally isolated.")).toBeVisible();

  await page.getByRole("button", { name: "Generate the mission board" }).click();
  await expect(page.getByText("Board generated below")).toBeVisible();

  await page.getByRole("button", { name: "Complete the first mission" }).click();
  await expect(page.getByText("the next mission unlocked itself")).toBeVisible();

  await page.getByRole("button", { name: "Run the curiosity engine" }).click();
  await expect(page.getByText("rules engine · offline-capable")).toBeVisible();

  await page.getByRole("button", { name: "Run the analysis pipeline" }).click();
  // The button is replaced by the outcome in every branch.
  await expect(page.getByRole("button", { name: "Run the analysis pipeline" })).toBeHidden({
    timeout: 60_000,
  });
  // Exactly one outcome badge renders: a real analysis, a low-confidence
  // analysis, or the typed unavailable state. Anything else is a bug.
  await expect(page.getByText(/^(unavailable|analysed|low confidence)$/)).toBeVisible({
    timeout: 60_000,
  });
});
