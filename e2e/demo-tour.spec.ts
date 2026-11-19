/**
 * Phase 71.1/71.2 — the full demo tour at phone, tablet and laptop sizes.
 * At every step the Next/Finish and End tour buttons are on screen and
 * actually clickable (topmost at their center). Navigating away mid-tour
 * pauses instead of dragging the visitor back.
 */
import { test, expect, type Page } from "@playwright/test";
import { applyDemoSession } from "./helpers";

const SIZES = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1366, height: 768 },
];
async function clickable(page: Page, name: RegExp) {
  const button = page
    .getByRole("dialog", { name: /^Tour:/ })
    .getByRole("button", { name });
  await expect(button).toBeVisible();
  // "" = on screen and topmost; otherwise a description of what is wrong.
  const problem = await button.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const box = `[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)} in ${innerWidth}x${innerHeight}]`;
    if (
      r.bottom > innerHeight ||
      r.right > innerWidth ||
      r.top < 0 ||
      r.left < 0
    ) {
      return `off screen ${box}`;
    }
    const hit = document.elementFromPoint(
      r.left + r.width / 2,
      r.top + r.height / 2,
    );
    if (hit === el || (hit !== null && el.contains(hit))) return "";
    // Next.js dev indicator (pinned bottom-left in `next dev` only; absent
    // from production builds) — dev tooling, not the app.
    if (hit?.tagName === "NEXTJS-PORTAL") return "";
    const cls = (hit?.getAttribute("class") ?? "").slice(0, 80);
    return `covered by <${hit?.tagName.toLowerCase()} id="${hit?.id ?? ""}" class="${cls}"> ${box}`;
  });
  expect(problem, `${name} must be on screen and topmost`).toBe("");
  return button;
}

for (const size of SIZES) {
  test(`full tour at ${size.width}x${size.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: size });
    await applyDemoSession(context);
    const page = await context.newPage();
    await page.goto("/?demo=1");
    await page.getByRole("button", { name: /skip tour/i }).waitFor();
    // pick the first guide
    await page
      .getByRole("dialog", { name: /choose your guide/i })
      .getByRole("button")
      .nth(1)
      .click();

    for (let i = 0; i < 6; i++) {
      const dialog = page.getByRole("dialog", { name: /^Tour:/ });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(1800); // let the step settle (scroll + re-measure)
      await clickable(page, /end tour/i);
      const next = await clickable(page, i === 5 ? /finish/i : /next/i);
      await next.click();
    }
    await expect(page.getByRole("dialog", { name: /^Tour:/ })).toHaveCount(0);
    await context.close();
  });
}

test("navigating away mid-tour pauses instead of bouncing back", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await applyDemoSession(context);
  await context.addInitScript(() => {
    try {
      if (!sessionStorage.getItem("seeded")) {
        sessionStorage.setItem("cascade-demo-tour", "0");
        sessionStorage.setItem("seeded", "1");
      }
    } catch {}
  });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: /^Tour:/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/tasks");
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).pathname).toBe("/tasks");
  await expect(
    page.getByRole("button", { name: /resume tour/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /resume tour/i }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.getByRole("dialog", { name: /^Tour:/ })).toBeVisible();
  await context.close();
});

test("each step moves focus into the bubble, and Escape ends the tour (71.2)", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
  });
  await applyDemoSession(context);
  const page = await context.newPage();
  await page.goto("/?demo=1");
  await page
    .getByRole("dialog", { name: /choose your guide/i })
    .getByRole("button")
    .nth(1)
    .click();
  const dialog = page.getByRole("dialog", { name: /^Tour:/ });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => dialog.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
  // Not a modal: the page behind stays usable.
  expect(await dialog.getAttribute("aria-modal")).toBeNull();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await context.close();
});

test("guide picker is usable on a small phone (360x640) (71.2)", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 640 },
  });
  await applyDemoSession(context);
  const page = await context.newPage();
  await page.goto("/?demo=1");
  const picker = page.getByRole("dialog", { name: /choose your guide/i });
  await expect(picker).toBeVisible({ timeout: 15_000 });
  const box = await picker.boundingBox();
  expect(
    box &&
      box.y >= 0 &&
      box.y + box.height <= 640 &&
      box.x >= 0 &&
      box.x + box.width <= 360,
  ).toBe(true);
  // Two columns, and the skip control is reachable by scrolling the picker.
  const skip = picker.getByRole("button", { name: /skip tour/i });
  await skip.scrollIntoViewIfNeeded();
  await expect(skip).toBeInViewport();
  await skip.click();
  await expect(picker).toHaveCount(0);
  await context.close();
});
