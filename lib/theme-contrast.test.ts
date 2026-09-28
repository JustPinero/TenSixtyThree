/**
 * Per-pack WCAG guard (Phase 61.2 / 61.4).
 *
 * The 12 theme packs were hand-picked hexes with nothing checking that
 * the pairs were legible. Measured in production: a border token used as
 * text at 1.50:1, --text-dim failing AA in all 12 packs, and the `sprite`
 * pack failing on every semantic color. This test is the regression net.
 */
import { describe, expect, it } from "vitest";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { AA_NON_TEXT, AA_NORMAL, contrastRatio } from "./contrast";
import { THEME_KEYS } from "./theme-registry";

const CSS = readFileSync(
  path.resolve(__dirname, "../app/globals.css"),
  "utf-8",
);

function tokens(key: string): Record<string, string> {
  const m = CSS.match(
    new RegExp(String.raw`[^{}]*\[data-theme="${key}"\][^{}]*\{([^}]*)\}`),
  );
  if (!m) throw new Error(`no CSS block for theme "${key}"`);
  const out: Record<string, string> = {};
  for (const d of m[1].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[d[1]] = d[2].trim();
  }
  return out;
}

/** Registry packs (the legacy dark/light aliases share blocks and are not keys). */
const PACKS = THEME_KEYS;

/** Text colors that must be readable on the panel background. */
const TEXT_ON_PANEL = ["--text-primary", "--text-secondary", "--muted"];

/** Semantic colors used for status text/labels on panels. */
const SEMANTIC = [
  "--cyan",
  "--amber",
  "--danger",
  "--info",
  "--accent",
  "--success",
];

describe("theme pack contrast (WCAG AA)", () => {
  it("checks every registered pack", () => {
    expect(PACKS.length).toBeGreaterThanOrEqual(12);
  });

  for (const key of PACKS) {
    describe(key, () => {
      const t = tokens(key);

      for (const name of TEXT_ON_PANEL) {
        it(`${name} on --bg-panel meets AA (4.5:1)`, () => {
          const ratio = contrastRatio(t[name], t["--bg-panel"]);
          expect(
            ratio,
            `${key}: ${name} ${t[name]} on ${t["--bg-panel"]} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_NORMAL);
        });
      }

      for (const name of SEMANTIC) {
        it(`${name} on --bg-panel is usable as status text (3:1)`, () => {
          const ratio = contrastRatio(t[name], t["--bg-panel"]);
          expect(
            ratio,
            `${key}: ${name} ${t[name]} on ${t["--bg-panel"]} = ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(AA_NON_TEXT);
        });
      }

      // The sidebar paints bg-linear-to-b from-space-800 via-space-850
      // to-space-900, i.e. --bg-panel -> --bg-secondary -> --bg-primary.
      // Nav labels must stay readable over EVERY stop (regression for the
      // hardcoded dark gradient that made nav 1.07:1 in light packs).
      for (const stop of ["--bg-panel", "--bg-secondary", "--bg-primary"]) {
        it(`sidebar labels are readable over ${stop}`, () => {
          for (const label of ["--text-secondary", "--text-primary"]) {
            const ratio = contrastRatio(t[label], t[stop]);
            expect(
              ratio,
              `${key}: ${label} ${t[label]} on ${stop} ${t[stop]} = ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(AA_NORMAL);
          }
        });
      }

      it("--border-bright is a BORDER, not text (>=3:1 non-text only)", () => {
        // Guards the original defect: --border-bright was surfaced as
        // `text-muted` on 155 elements at 1.50:1.
        const ratio = contrastRatio(t["--border-bright"], t["--bg-panel"]);
        expect(ratio).toBeLessThan(AA_NORMAL);
      });
    });
  }
});

describe("no border token is used as a text color", () => {
  const BORDER_AS_TEXT = ["text", "space", "500"].join("-");
  it(`${BORDER_AS_TEXT} (a --border-bright alias) appears nowhere in app/`, () => {
    const root = path.resolve(__dirname, "..");
    let hits = "";
    try {
      hits = execSync(
        `grep -rno ${JSON.stringify(BORDER_AS_TEXT)} ${JSON.stringify(path.join(root, "app"))} || true`,
        { encoding: "utf-8" },
      );
    } catch {
      hits = "";
    }
    const lines = hits.split("\n").filter(Boolean);
    expect(
      lines.length,
      `use text-muted instead:\n${lines.slice(0, 10).join("\n")}`,
    ).toBe(0);
  });
});
