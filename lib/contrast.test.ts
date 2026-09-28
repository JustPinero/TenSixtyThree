/**
 * WCAG 2.1 relative-luminance + contrast-ratio math. Pure; the theme
 * contrast guards (lib/theme-contrast.test.ts) are built on it.
 */
import { describe, expect, it } from "vitest";
import { contrastRatio, parseColor, relativeLuminance } from "./contrast";

describe("parseColor", () => {
  it("parses 6-digit hex", () => {
    expect(parseColor("#41a6b5")).toEqual([0x41, 0xa6, 0xb5]);
  });
  it("parses 3-digit shorthand hex", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#08f")).toEqual([0, 0x88, 0xff]);
  });
  it("is case- and whitespace-insensitive", () => {
    expect(parseColor("  #E4E8EE  ")).toEqual([0xe4, 0xe8, 0xee]);
  });
  it("parses rgb() and rgba(), ignoring alpha", () => {
    expect(parseColor("rgb(17, 22, 32)")).toEqual([17, 22, 32]);
    expect(parseColor("rgba(17, 22, 32, 0.8)")).toEqual([17, 22, 32]);
  });
  it("returns null for values it cannot resolve", () => {
    expect(parseColor("var(--cyan)")).toBeNull();
    expect(parseColor("")).toBeNull();
    expect(parseColor("not-a-color")).toBeNull();
  });
});

describe("relativeLuminance", () => {
  it("is 0 for black and 1 for white", () => {
    expect(relativeLuminance([0, 0, 0])).toBeCloseTo(0, 5);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 5);
  });
});

describe("contrastRatio", () => {
  // Reference values from the WCAG definition.
  it("black on white is 21:1", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });
  it("identical colors are 1:1", () => {
    expect(contrastRatio("#41a6b5", "#41a6b5")).toBeCloseTo(1, 5);
  });
  it("#777 on white is ~4.48 (just under AA)", () => {
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
  it("#767676 on white is ~4.54 (just over AA)", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
  });
  it("is symmetric", () => {
    expect(contrastRatio("#111620", "#e4e8ee")).toBeCloseTo(
      contrastRatio("#e4e8ee", "#111620"),
      10,
    );
  });
  it("throws on an unparseable color so a typo cannot silently pass", () => {
    expect(() => contrastRatio("var(--x)", "#fff")).toThrow(/parse/i);
  });

  it("reproduces the measured production failure (border token as text)", () => {
    // --border-bright #2e3550 on --bg-panel #111620, measured live at 1.50
    expect(contrastRatio("#2e3550", "#111620")).toBeCloseTo(1.5, 1);
  });
});
