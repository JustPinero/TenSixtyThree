/**
 * Phase 23.8 — minimal smoke specs replacing the stale ones.
 *
 * Three thin smokes that catch "the page crashes at runtime" — what
 * `next build` doesn't catch. Selectors target stable structural
 * elements (page title + a single h2/h1) rather than copy that
 * tends to drift.
 */
import { test, expect } from "@playwright/test";

test.describe("smokes", () => {
  test("dashboard renders without throwing", async ({ page }) => {
    await page.goto("/");
    // Phase 57.2 — was /cascade/i. The product is TenSixtyThree; the
    // assertion predated the rename and CI had been dead since July, so
    // nothing caught it. Match the product name, not the old codename.
    await expect(page).toHaveTitle(/tensixtythree/i);
    // The sidebar h1 is the wordmark; the main heading says "Dashboard".
    // Use the main heading specifically — the sidebar h1 is on every page.
    await expect(
      page.getByRole("heading", { level: 1, name: /dashboard/i })
    ).toBeVisible();
  });

  test("Overseer chat page renders without throwing", async ({ page }) => {
    await page.goto("/delamain");
    await expect(page).toHaveTitle(/tensixtythree.*delamain/i);
    // The page-level h2 says "Overseer".
    await expect(
      page.getByRole("heading", { level: 2, name: /overseer/i })
    ).toBeVisible();
  });

  test("/observability/cache renders without throwing", async ({ page }) => {
    await page.goto("/observability/cache");
    // Phase 23.3 page header is exact text. Tolerant of subsequent
    // copy edits via partial regex.
    await expect(
      page.getByRole("heading", { name: /anthropic cache observability/i })
    ).toBeVisible();
  });

  test("project wizard renders without throwing", async ({ page }) => {
    // Phase 23 follow-up P1.3 — wizard is the new-user onboarding
    // surface; covered specs were deleted in 23.8 cleanup, restored
    // here. Verifies the wizard mounts and the project-name input
    // is interactive — doesn't drive the full 7-step flow.
    await page.goto("/create");
    await expect(
      page.getByRole("heading", { level: 1, name: /create project/i })
    ).toBeVisible();
    const nameInput = page.getByPlaceholder(/my awesome project/i);
    await expect(nameInput).toBeVisible();
    await nameInput.fill("Smoke Test Project");
    await expect(nameInput).toHaveValue("Smoke Test Project");
  });
});
