/**
 * Phase 62.6 — eslint-config-next registers the jsx-a11y plugin but ships
 * these rules OFF. That is why 9 unassociated form labels and a
 * keyboard-trapping scrim reached production with a green lint.
 *
 * This pins the rules on: turning one off is a deliberate, visible edit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const CONFIG = readFileSync(
  path.resolve(__dirname, "../eslint.config.mjs"),
  "utf-8",
);

const REQUIRED_RULES = [
  "jsx-a11y/label-has-associated-control",
  "jsx-a11y/click-events-have-key-events",
  "jsx-a11y/no-static-element-interactions",
  "jsx-a11y/no-noninteractive-element-interactions",
  "jsx-a11y/role-has-required-aria-props",
  "jsx-a11y/aria-props",
  "jsx-a11y/interactive-supports-focus",
];

describe("accessibility lint", () => {
  for (const rule of REQUIRED_RULES) {
    it(`keeps ${rule} enabled`, () => {
      const re = new RegExp(
        String.raw`"${rule}":\s*(\[\s*)?"(error|warn)"`,
      );
      expect(CONFIG, `${rule} is not enabled in eslint.config.mjs`).toMatch(re);
    });
  }

  it("scopes the no-img-element exception to the portrait component only", () => {
    // The blanket project-wide disable was justified by user-supplied
    // portrait URLs, which is true for exactly one of five call sites.
    expect(CONFIG).toMatch(/files:\s*\["app\/components\/portrait\.tsx"\]/);
    const blanket = CONFIG.match(/"@next\/next\/no-img-element":\s*"off"/g);
    expect(blanket?.length ?? 0).toBe(1);
  });
});
