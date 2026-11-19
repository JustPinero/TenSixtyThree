/**
 * Placement for the demo tour bubble (Phase 63.5, rebuilt in 71.1).
 *
 * Pure so every viewport case is testable. The contract (property-tested
 * in tour-position.test.ts): the bubble is ALWAYS fully inside the
 * viewport. If it is taller than the space available, `maxHeight` caps
 * it and the bubble scrolls internally, so its buttons can never fall
 * below the fold (the 2026-11-16 step-6 strand).
 *
 * Order of preference: below the target → above → beside (right, left)
 * → overlay in a corner. Below the sm breakpoint the bubble is a bottom
 * sheet instead; a missing or off-canvas target gets a centered bubble.
 */

/** Minimum gap between the bubble and any viewport edge. */
export const GUTTER = 16;
/** Natural (desktop) bubble width — Tailwind w-80. */
export const BUBBLE_WIDTH = 320;
/** Below this width the bubble docks as a bottom sheet (Tailwind `sm`). */
export const SHEET_BREAKPOINT = 640;
/** Fallback before the bubble has been measured. */
const DEFAULT_BUBBLE_HEIGHT = 220;
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
  /** Cap on rendered height; the bubble scrolls internally beyond it. */
  maxHeight: number;
  mode: "anchored" | "sheet" | "centered";
}

function clamp(value: number, min: number, max: number): number {
  // max < min on tiny viewports; min wins so we never return < min.
  return Math.max(min, Math.min(value, max));
}

/** The part of the target actually on screen, or null if none is. */
export function highlightRect(
  rect: TargetRect | null,
  viewport: Viewport,
): TargetRect | null {
  if (!rect) return null;
  const top = Math.max(rect.top, 0);
  const left = Math.max(rect.left, 0);
  const bottom = Math.min(rect.top + rect.height, viewport.height);
  const right = Math.min(rect.left + rect.width, viewport.width);
  if (bottom <= top || right <= left) return null;
  return { top, left, width: right - left, height: bottom - top };
}

export function tourBubblePosition(
  rect: TargetRect | null,
  viewport: Viewport,
  bubbleHeight: number = DEFAULT_BUBBLE_HEIGHT,
): BubblePosition {
  // Bottom sheet on phones: full width, flush with the bottom edge.
  if (viewport.width < SHEET_BREAKPOINT) {
    const maxHeight = Math.max(0, Math.floor(viewport.height * 0.6));
    const height = Math.min(bubbleHeight, maxHeight);
    return {
      top: viewport.height - height,
      left: 0,
      width: viewport.width,
      maxHeight,
      mode: "sheet",
    };
  }

  const width = Math.min(BUBBLE_WIDTH, viewport.width - GUTTER * 2);
  const maxHeight = Math.max(0, viewport.height - GUTTER * 2);
  const height = Math.min(bubbleHeight, maxHeight);
  const maxTop = viewport.height - GUTTER - height;
  const maxLeft = viewport.width - GUTTER - width;

  const visible = highlightRect(rect, viewport);
  if (!visible) {
    return {
      top: clamp((viewport.height - height) / 2, GUTTER, maxTop),
      left: clamp((viewport.width - width) / 2, GUTTER, maxLeft),
      width,
      maxHeight,
      mode: "centered",
    };
  }

  const anchoredLeft = clamp(visible.left, GUTTER, maxLeft);
  const visibleBottom = visible.top + visible.height;

  const below = visibleBottom + OFFSET;
  if (below <= maxTop) {
    return {
      top: below,
      left: anchoredLeft,
      width,
      maxHeight,
      mode: "anchored",
    };
  }
  const above = visible.top - OFFSET - height;
  if (above >= GUTTER) {
    return {
      top: above,
      left: anchoredLeft,
      width,
      maxHeight,
      mode: "anchored",
    };
  }
  const besideTop = clamp(visible.top, GUTTER, maxTop);
  const right = visible.left + visible.width + OFFSET;
  if (right <= maxLeft) {
    return { top: besideTop, left: right, width, maxHeight, mode: "anchored" };
  }
  const left = visible.left - OFFSET - width;
  if (left >= GUTTER) {
    return { top: besideTop, left, width, maxHeight, mode: "anchored" };
  }
  // No free side (target fills the screen): overlay the bottom-right
  // corner — always fully visible, the highlight shows what it's about.
  return { top: maxTop, left: maxLeft, width, maxHeight, mode: "anchored" };
}
