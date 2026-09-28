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

  for (const width of [320, 360, 375, 390]) {
    it(`stays fully on screen at ${width}px (the reported break)`, () => {
      const p = tourBubblePosition(rect({ left: 40 }), { width, height: 640 });
      expect(p.left, "negative left pushes the bubble off-screen").toBeGreaterThanOrEqual(
        GUTTER,
      );
      expect(p.left + p.width).toBeLessThanOrEqual(width - GUTTER);
    });
  }

  it("shrinks the bubble instead of overflowing on a narrow viewport", () => {
    const p = tourBubblePosition(rect(), { width: 320, height: 640 });
    expect(p.width).toBeLessThanOrEqual(320 - GUTTER * 2);
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
