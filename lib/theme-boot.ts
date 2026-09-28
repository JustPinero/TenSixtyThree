/**
 * Pre-hydration theme boot (Phase 61.5).
 *
 * `<html data-theme>` was hardcoded to "dark" and the real pack was only
 * applied after hydration (useSyncExternalStore reading localStorage), so
 * every non-cyberpunk user saw a full-page flash of dark cyberpunk on
 * every navigation and reload.
 *
 * This script runs BEFORE first paint, stamps the stored pack, and falls
 * back to the OS color-scheme preference for first-time visitors.
 */
import { THEME_KEYS } from "./theme-registry";

/** localStorage key holding the selected pack. */
export const THEME_STORAGE_KEY = "cascade-theme";

/** Pack used when nothing is stored and the OS prefers light. */
export const LIGHT_DEFAULT_THEME = "sunny";
/** Pack used when nothing is stored and the OS prefers dark (or is unset). */
export const DARK_DEFAULT_THEME = "cyberpunk";

/**
 * Minified IIFE for a blocking inline <script>. Wrapped in try/catch:
 * localStorage throws in private mode / with site data blocked, and a
 * throw here would leave the page unthemed.
 */
export function themeBootScript(
  validKeys: readonly string[] = THEME_KEYS,
): string {
  const keys = JSON.stringify(validKeys);
  return (
    `(function(){try{` +
    `var k=${keys},s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
    `if(k.indexOf(s)===-1){s=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches` +
    `?${JSON.stringify(LIGHT_DEFAULT_THEME)}:${JSON.stringify(DARK_DEFAULT_THEME)};}` +
    `document.documentElement.setAttribute("data-theme",s);` +
    `}catch(e){document.documentElement.setAttribute("data-theme",${JSON.stringify(DARK_DEFAULT_THEME)});}})()`
  );
}
