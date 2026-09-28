/**
 * WCAG 2.1 contrast math (pure, dependency-free).
 *
 * Phase 61 — the theme packs ship hand-picked hexes and nothing checked
 * that foreground/background pairs were legible. A border token used as
 * a text color measured 1.50:1 in production. These helpers back the
 * per-pack guards in lib/theme-contrast.test.ts.
 */

export type Rgb = [number, number, number];

/** #rgb, #rrggbb, rgb(), rgba() → [r,g,b]; null when not a literal color. */
export function parseColor(value: string): Rgb | null {
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    const full =
      h.length === 3
        ? h
            .split("")
            .map((c) => c + c)
            .join("")
        : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  }
  const rgb = v.match(/^rgba?\(\s*([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return null;
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors, 1..21. Throws on unparseable input. */
export function contrastRatio(a: string, b: string): number {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca) throw new Error(`contrastRatio: cannot parse color "${a}"`);
  if (!cb) throw new Error(`contrastRatio: cannot parse color "${b}"`);
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG 2.1 AA minimums. */
export const AA_NORMAL = 4.5;
export const AA_LARGE = 3;
export const AA_NON_TEXT = 3;
