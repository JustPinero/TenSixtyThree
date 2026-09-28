/**
 * Placement for the demo tour bubble (Phase 63.5).
 *
 * Pure so the narrow-viewport cases are testable: the previous inline
 * clamp produced a negative `left` below 376px, putting the public
 * demo's persona tour off-screen on common phones.
 */

/** Minimum gap between the bubble and any viewport edge. */
export const GUTTER = 16;
/** Natural (desktop) bubble width — Tailwind w-80. */
export const BUBBLE_WIDTH = 320;
/** Space to reserve below the target before flipping above it. */
const BUBBLE_HEIGHT = 220;
/** Gap between the highlighted target and the bubble. */
const OFFSET = 12;

/** Just the geometry we need — accepts a DOMRect or the component's own Rect. */
export interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface BubblePosition {
  top: number;
  left: number;
  width: number;
}

function clamp(value: number, min: number, max: number): number {
  // max < min on tiny viewports; min wins so we never return < min.
  return Math.max(min, Math.min(value, max));
}

export function tourBubblePosition(
  rect: TargetRect | null,
  viewport: Viewport,
): BubblePosition {
  const width = Math.min(BUBBLE_WIDTH, viewport.width - GUTTER * 2);

  if (!rect) {
    return { top: 120, left: clamp(120, GUTTER, viewport.width - width - GUTTER), width };
  }

  const below = rect.top + rect.height + OFFSET;
  const fitsBelow = below + BUBBLE_HEIGHT <= viewport.height - GUTTER;
  const rawTop = fitsBelow ? below : rect.top - BUBBLE_HEIGHT - OFFSET;

  return {
    top: clamp(rawTop, GUTTER, Math.max(GUTTER, viewport.height - GUTTER)),
    left: clamp(rect.left, GUTTER, viewport.width - width - GUTTER),
    width,
  };
}
