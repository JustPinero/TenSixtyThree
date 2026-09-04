import { describe, it, expect } from "vitest";
import {
  THEME_PACKS,
  THEME_KEYS,
  getThemePack,
  resolveThemeKey,
  type ThemeKey,
} from "./theme-registry";

// The 12 packs from the design doc (leonardoPrompts/portrait-prompts.md),
// in its order.
const EXPECTED_KEYS = [
  "sunny",
  "cyberpunk",
  "console",
  "cog",
  "sprite",
  "margin",
  "curator",
  "sage",
  "pilot",
  "pixel",
  "quiet",
  "specter",
] as const;

describe("THEME_PACKS", () => {
  it("contains exactly the 12 design-doc packs in order", () => {
    expect(THEME_PACKS.map((p) => p.key)).toEqual([...EXPECTED_KEYS]);
    expect(THEME_KEYS).toEqual([...EXPECTED_KEYS]);
  });

  it("every pack has complete display fields", () => {
    for (const pack of THEME_PACKS) {
      expect(pack.label.length).toBeGreaterThan(0);
      expect(pack.description.length).toBeGreaterThan(0);
      expect(pack.preview).toHaveLength(4);
      for (const swatch of pack.preview) {
        expect(swatch).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it("every pack has a persona with a nonempty name", () => {
    for (const pack of THEME_PACKS) {
      expect(pack.persona.name.length).toBeGreaterThan(0);
    }
  });

  it("cyberpunk is Delamain with the existing public assets", () => {
    const cyberpunk = getThemePack("cyberpunk");
    expect(cyberpunk?.persona.name).toBe("Delamain");
    expect(cyberpunk?.persona.portraitIdle).toBe("/delamain.jpg");
    expect(cyberpunk?.persona.portraitTalking).toBe("/delamain-talking.jpg");
  });

  it("all non-cyberpunk packs point portraits at /portraits/<key>/", () => {
    for (const pack of THEME_PACKS) {
      if (pack.key === "cyberpunk") continue;
      expect(pack.persona.portraitIdle).toBe(`/portraits/${pack.key}/idle.jpg`);
      expect(pack.persona.portraitTalking).toBe(
        `/portraits/${pack.key}/talking.jpg`,
      );
    }
  });
});

describe("getThemePack", () => {
  it("returns the pack for a valid key and null otherwise", () => {
    expect(getThemePack("sage")?.key).toBe("sage");
    expect(getThemePack("neon-nonsense")).toBeNull();
  });
});

describe("resolveThemeKey", () => {
  it("migrates legacy stored values", () => {
    expect(resolveThemeKey("dark")).toBe("cyberpunk");
    expect(resolveThemeKey("light")).toBe("sunny");
  });

  it("passes through every registry key", () => {
    for (const key of THEME_KEYS) {
      expect(resolveThemeKey(key)).toBe(key);
    }
  });

  it("falls back to cyberpunk on null or garbage", () => {
    expect(resolveThemeKey(null)).toBe("cyberpunk");
    expect(resolveThemeKey("")).toBe("cyberpunk");
    expect(resolveThemeKey("vaporwave")).toBe("cyberpunk");
  });

  it("return type is always a valid ThemeKey", () => {
    const resolved: ThemeKey = resolveThemeKey("whatever");
    expect(THEME_KEYS).toContain(resolved);
  });
});
