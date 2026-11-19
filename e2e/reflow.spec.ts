/**
 * Phase 71.3/71.4 — no horizontal page scroll from 320px up (WCAG 1.4.10)
 * and interactive targets of at least 24x24 CSS px (WCAG 2.5.8) that are
 * not covered by something else. Runs as a demo visitor so pages have
 * content; the route list comes from the filesystem.
 */
import { test, expect } from "@playwright/test";
import { staticRoutes, applyDemoSession } from "./helpers";

const WIDTHS = [320, 390, 768, 1024];
for (const route of staticRoutes().filter((r) => r !== "/signin")) {
  test(`reflow + targets: ${route}`, async ({ browser }) => {
    for (const width of WIDTHS) {
      const context = await browser.newContext({ viewport: { width, height: 800 } });
      await applyDemoSession(context);
      // Keep the tour out of the way of the page audit.
      await context.addInitScript(() => {
        try {
          sessionStorage.setItem("cascade-demo-tour", "done");
        } catch {}
      });
      const page = await context.newPage();
      // A hydration mismatch means the server HTML and the first client
      // render disagree (e.g. a browser-only check inside useState) — a
      // real bug, and in dev it also pins an overlay badge over the UI.
      const hydrationErrors: string[] = [];
      page.on("console", (msg) => {
        if (msg.type() === "error" && /Hydration failed|hydration mismatch/i.test(msg.text())) {
          hydrationErrors.push(msg.text().slice(0, 160));
        }
      });
      await page.goto(route);
      await page.waitForLoadState("networkidle");

      // Both the document AND <main> (the shell's scroll container): with
      // min-w-0 on the column, wide content would otherwise just scroll
      // sideways inside main, which fails reflow all the same.
      const overflow = await page.evaluate(() => {
        const main = document.querySelector("main");
        return Math.max(
          document.documentElement.scrollWidth - window.innerWidth,
          main ? main.scrollWidth - main.clientWidth : 0,
        );
      });
      expect(overflow, `${route} @${width}: horizontal overflow`).toBeLessThanOrEqual(0);

      const bad = await page.evaluate(() => {
        const problems: string[] = [];
        const els = document.querySelectorAll<HTMLElement>(
          "main a[href], main button, main input:not([type=hidden]), main select, main textarea, main [role=button]",
        );
        for (const el of els) {
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          // A checkbox/radio is operated through its <label> (clicking the
          // label toggles it), so the label box is the real hit area.
          const label =
            el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")
              ? el.labels?.[0]
              : undefined;
          const r = (label ?? el).getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          // Inline text links inside a sentence are exempt (WCAG 2.5.8).
          const inline =
            el.tagName === "A" && style.display === "inline" && el.closest("p, li") !== null;
          if (!inline && (r.width < 24 || r.height < 24)) {
            problems.push(`small ${Math.round(r.width)}x${Math.round(r.height)}: ${el.outerHTML.slice(0, 80)}`);
            continue;
          }
          el.scrollIntoView({ block: "center", inline: "center" });
          const box = el.getBoundingClientRect();
          const cx = box.left + box.width / 2;
          const cy = box.top + box.height / 2;
          if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
          const top = document.elementFromPoint(cx, cy);
          // Next.js dev overlay (issue badge) — dev tooling, not the app.
          if (top?.tagName === "NEXTJS-PORTAL") continue;
          if (top && top !== el && !el.contains(top) && !top.contains(el) && !(el instanceof HTMLInputElement && el.labels?.length)) {
            problems.push(`covered by <${top.tagName.toLowerCase()}>: ${el.outerHTML.slice(0, 80)}`);
          }
        }
        return problems;
      });
      expect(hydrationErrors, `${route} @${width}: hydration mismatch`).toEqual([]);
      expect(bad, `${route} @${width}`).toEqual([]);
      await context.close();
    }
  });
}
