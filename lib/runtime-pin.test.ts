/**
 * Keep the local runtime on the version CI uses.
 *
 * `engines.node` said only ">=20", and there was no .nvmrc. The machine
 * drifted to Node 25.2.1, where jsdom's `localStorage` resolves to a bare
 * `{}` with no methods — `localStorage.clear is not a function` — failing
 * 25 tests across 4 files (theme-pack-apply, theme-provider, sounds.theme,
 * morning-briefing). CI, pinned to Node 22, stayed green the whole time, so
 * the divergence was invisible from the outside. All 25 pass again on
 * Node 22.
 *
 * These assertions make that class of drift loud instead of silent.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const pkg = JSON.parse(
  readFileSync(path.join(ROOT, "package.json"), "utf-8"),
) as { engines?: { node?: string }; packageManager?: string };
const ci = readFileSync(path.join(ROOT, ".github/workflows/ci.yml"), "utf-8");

/** Majors CI installs, from every `node-version:` in the workflow. */
function ciNodeMajors(): string[] {
  return [...ci.matchAll(/node-version:\s*["']?(\d+)/g)].map((m) => m[1]);
}

describe("runtime pin", () => {
  it("ships an .nvmrc", () => {
    const nvmrc = readFileSync(path.join(ROOT, ".nvmrc"), "utf-8").trim();
    expect(nvmrc).toMatch(/^\d+/);
  });

  it("pins .nvmrc to the same major CI installs", () => {
    const nvmrc = readFileSync(path.join(ROOT, ".nvmrc"), "utf-8").trim();
    const majors = new Set(ciNodeMajors());
    expect(majors.size, "CI should install one Node major").toBe(1);
    expect(nvmrc.split(".")[0]).toBe([...majors][0]);
  });

  it("bounds engines.node instead of leaving it open-ended", () => {
    const range = pkg.engines?.node ?? "";
    expect(range, "engines.node must have an upper bound").toMatch(/</);
    expect(range).toContain([...new Set(ciNodeMajors())][0]);
  });

  it("runs on a Node major the project actually supports", () => {
    const major = process.versions.node.split(".")[0];
    const expected = [...new Set(ciNodeMajors())][0];
    expect(
      major,
      `running Node ${process.versions.node}; CI uses ${expected}. ` +
        `Run \`nvm use\` — Node 25 breaks jsdom's localStorage.`,
    ).toBe(expected);
  });

  it("declares the package manager so CI and local agree", () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/);
  });
});
