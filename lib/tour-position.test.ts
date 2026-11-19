/**
 * Phase 63.5 — the demo tour bubble is clamped with
 * `Math.min(Math.max(rect.left, 16), innerWidth - 360)` against a 320px
 * (w-80) bubble. Below 376px the outer min() wins and returns a NEGATIVE
 * left, so the public demo's persona tour sits off-screen on an iPhone SE
 * or a 360px Android. The vertical clamp has the same shape.
 */
import { describe, expect, it } from "vitest";
import { GUTTER, type TargetRect, tourBubblePosition } from "./tour-position";

const rect = (over: Partial<TargetRect> = {}): TargetRect => ({
  top: 100,
  left: 200,
  width: 120,
  height: 40,
  ...over,
});

describe("tourBubblePosition", () => {
  it("places the bubble under the target on a roomy viewport", () => {
    const p = tourBubblePosition(rect(), { width: 1440, height: 900 });
    expect(p.left).toBe(200);
    expect(p.top).toBe(152);
  });

  it("never goes off the left edge", () => {
    const p = tourBubblePosition(rect({ left: -50 }), { width: 1440, height: 900 });
    expect(p.left).toBeGreaterThanOrEqual(GUTTER);
  });

  it("never overflows the right edge", () => {
    const p = tourBubblePosition(rect({ left: 1400 }), { width: 1440, height: 900 });
    expect(p.left + p.width).toBeLessThanOrEqual(1440 - GUTTER);
  });

  // 71.1 — phones now get a full-width bottom sheet (no side gutters);
  // the 63.5 regression this guarded (negative left) still can't happen.
  for (const width of [320, 360, 375, 390]) {
    it(`stays fully on screen at ${width}px (the reported break)`, () => {
      const p = tourBubblePosition(rect({ left: 40 }), { width, height: 640 });
      expect(p.mode).toBe("sheet");
      expect(p.left, "negative left pushes the bubble off-screen").toBeGreaterThanOrEqual(0);
      expect(p.left + p.width).toBeLessThanOrEqual(width);
    });
  }

  it("shrinks the bubble instead of overflowing just above the sheet breakpoint", () => {
    const p = tourBubblePosition(rect(), { width: 660, height: 640 });
    expect(p.width).toBeLessThanOrEqual(660 - GUTTER * 2);
  });

  it("caps the bubble at its natural width on wide viewports", () => {
    const p = tourBubblePosition(rect(), { width: 1440, height: 900 });
    expect(p.width).toBe(320);
  });

  it("keeps the bubble on screen vertically", () => {
    const p = tourBubblePosition(rect({ top: 860 }), { width: 1440, height: 900 });
    expect(p.top).toBeGreaterThanOrEqual(GUTTER);
    expect(p.top).toBeLessThanOrEqual(900 - GUTTER);
  });

  it("flips above the target when there is no room below", () => {
    const p = tourBubblePosition(rect({ top: 700, height: 40 }), {
      width: 1440,
      height: 800,
    });
    expect(p.top).toBeLessThan(700);
  });

  it("falls back to a fixed spot with no target rect", () => {
    const p = tourBubblePosition(null, { width: 1440, height: 900 });
    expect(p.top).toBeGreaterThanOrEqual(GUTTER);
    expect(p.left).toBeGreaterThanOrEqual(GUTTER);
  });
});

/**
 * Phase 71.1 — measured 2026-11-16: step 6 stranded the visitor at every
 * size because the vertical clamp allowed `top` up to height - 16, so the
 * bubble's buttons sat below the fold. The contract now: for every target
 * shape × viewport × bubble height, the bubble is fully inside the
 * viewport (scrolling within the bubble if it is taller than the screen).
 */
import { highlightRect, SHEET_BREAKPOINT } from "./tour-position";

const VIEWPORTS = [
  [320, 568], [360, 640], [390, 844], [768, 1024],
  [1024, 768], [1280, 600], [1366, 768], [1920, 1080],
] as const;

function targets(w: number, h: number): Record<string, TargetRect | null> {
  return {
    "small, top-left": { top: 20, left: 20, width: 100, height: 30 },
    "small, bottom edge": { top: h - 40, left: w / 2, width: 100, height: 30 },
    "below the fold": { top: h + 900, left: 40, width: 300, height: 200 },
    "above the fold": { top: -800, left: 40, width: 300, height: 200 },
    "taller than viewport": { top: 60, left: 0, width: w, height: h * 3 },
    "wider than viewport": { top: 200, left: -100, width: w + 400, height: 120 },
    "off-canvas drawer": { top: 100, left: -224, width: 223, height: 40 },
    "right edge": { top: 300, left: w - 30, width: 30, height: 30 },
    missing: null,
  };
}

describe("71.1 — the bubble is always fully on screen", () => {
  for (const [w, h] of VIEWPORTS) {
    for (const bubbleHeight of [140, 220, 360]) {
      for (const [name, t] of Object.entries(targets(w, h))) {
        it(`${w}x${h} · bubble ${bubbleHeight}px · ${name}`, () => {
          const p = tourBubblePosition(t, { width: w, height: h }, bubbleHeight);
          const renderedHeight = Math.min(bubbleHeight, p.maxHeight);
          expect(p.left).toBeGreaterThanOrEqual(0);
          expect(p.top).toBeGreaterThanOrEqual(0);
          expect(p.left + p.width).toBeLessThanOrEqual(w);
          expect(p.top + renderedHeight).toBeLessThanOrEqual(h);
          if (p.mode !== "sheet") {
            expect(p.top).toBeGreaterThanOrEqual(GUTTER);
            expect(p.top + renderedHeight).toBeLessThanOrEqual(h - GUTTER);
          }
        });
      }
    }
  }
});

describe("71.1 — modes", () => {
  it("below the sm breakpoint the bubble docks as a bottom sheet", () => {
    const p = tourBubblePosition({ top: 100, left: 20, width: 100, height: 30 }, { width: 390, height: 844 }, 200);
    expect(SHEET_BREAKPOINT).toBe(640);
    expect(p.mode).toBe("sheet");
    expect(p.left).toBe(0);
    expect(p.width).toBe(390);
    expect(p.top + 200).toBe(844);
  });

  it("missing or off-canvas target → centered", () => {
    expect(tourBubblePosition(null, { width: 1366, height: 768 }, 200).mode).toBe("centered");
    expect(
      tourBubblePosition({ top: 100, left: -224, width: 223, height: 40 }, { width: 1024, height: 768 }, 200).mode,
    ).toBe("centered");
  });

  it("prefers below, then above, without covering the target", () => {
    const t = { top: 520, left: 100, width: 200, height: 40 };
    const p = tourBubblePosition(t, { width: 1366, height: 768 }, 200);
    // below would start at 572; 572 + 200 > 752 → above
    expect(p.top + 200).toBeLessThanOrEqual(t.top);
  });
});

describe("71.1 — highlightRect", () => {
  it("clips a target taller than the viewport to its visible part", () => {
    const r = highlightRect({ top: 60, left: 0, width: 800, height: 3000 }, { width: 1024, height: 768 });
    expect(r).toEqual({ top: 60, left: 0, width: 800, height: 708 });
  });
  it("returns null for an off-screen target", () => {
    expect(highlightRect({ top: 2000, left: 0, width: 10, height: 10 }, { width: 1024, height: 768 })).toBeNull();
    expect(highlightRect({ top: 10, left: -224, width: 223, height: 40 }, { width: 1024, height: 768 })).toBeNull();
  });
});
