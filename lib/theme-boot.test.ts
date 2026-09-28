import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  DARK_DEFAULT_THEME,
  LIGHT_DEFAULT_THEME,
  THEME_STORAGE_KEY,
  themeBootScript,
} from "./theme-boot";
import { THEME_KEYS } from "./theme-registry";

/** Run the boot script against a fake document/localStorage/matchMedia. */
function runBoot(opts: {
  stored?: string | null;
  prefersLight?: boolean;
  throwOnStorage?: boolean;
}): string | null {
  let applied: string | null = null;
  const sandbox = {
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === "data-theme") applied = value;
        },
      },
    },
    localStorage: {
      getItem: () => {
        if (opts.throwOnStorage) throw new Error("blocked");
        return opts.stored ?? null;
      },
    },
    window: {
      matchMedia: (q: string) => ({
        matches: q.includes("light") ? !!opts.prefersLight : !opts.prefersLight,
      }),
    },
  };
  const fn = new Function(
    "document",
    "localStorage",
    "window",
    themeBootScript(),
  );
  fn(sandbox.document, sandbox.localStorage, sandbox.window);
  return applied;
}

describe("themeBootScript", () => {
  it("applies a valid stored theme", () => {
    expect(runBoot({ stored: "curator" })).toBe("curator");
  });

  it("ignores a stored value that is not a real pack", () => {
    expect(runBoot({ stored: "not-a-theme" })).toBe(DARK_DEFAULT_THEME);
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(runBoot({ stored: null, prefersLight: true })).toBe(
      LIGHT_DEFAULT_THEME,
    );
    expect(runBoot({ stored: null, prefersLight: false })).toBe(
      DARK_DEFAULT_THEME,
    );
  });

  it("still themes the page when localStorage throws (private mode)", () => {
    expect(runBoot({ throwOnStorage: true })).toBe(DARK_DEFAULT_THEME);
  });

  it("only ever applies keys that have a CSS block", () => {
    for (const stored of THEME_KEYS) {
      expect(THEME_KEYS).toContain(runBoot({ stored }) as never);
    }
  });
});

describe("wiring", () => {
  const root = path.resolve(__dirname, "..");
  const layout = readFileSync(path.join(root, "app/layout.tsx"), "utf-8");
  const provider = readFileSync(
    path.join(root, "app/components/theme-provider.tsx"),
    "utf-8",
  );
  const css = readFileSync(path.join(root, "app/globals.css"), "utf-8");

  it("layout renders the boot script before hydration", () => {
    expect(layout).toMatch(/themeBootScript/);
  });

  it("layout does not hardcode a data-theme that overrides the script", () => {
    expect(layout).not.toMatch(/data-theme="[a-z]+"/);
  });

  it("provider and boot script agree on the storage key", () => {
    expect(provider).toContain("THEME_STORAGE_KEY");
    expect(THEME_STORAGE_KEY).toBe("cascade-theme");
  });

  it("CSS has an OS-preference fallback for unthemed first paint", () => {
    expect(css).toMatch(/prefers-color-scheme:\s*light/);
  });

  it("the OS-light fallback does not drift from the SUNNY pack", () => {
    const vars = (block: string) =>
      [...block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)]
        .map((m) => `${m[1]}:${m[2].trim()}`)
        .sort()
        .join("\n");
    const sunny = css.match(
      /\[data-theme="light"\], \[data-theme="sunny"\] \{([^}]*)\}/,
    );
    const fallback = css.match(
      /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme\]\) \{([\s\S]*?)\n  \}/,
    );
    expect(sunny, "no SUNNY block").not.toBeNull();
    expect(fallback, "no prefers-color-scheme fallback block").not.toBeNull();
    expect(vars(fallback![1])).toBe(vars(sunny![1]));
  });
});
