"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { resolveThemeKey, type ThemeKey } from "@/lib/theme-registry";
import { THEME_STORAGE_KEY } from "@/lib/theme-boot";

type Theme = ThemeKey;

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (theme: Theme) => void;
}>({
  theme: "cyberpunk",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "cyberpunk";
  // Phase 53 — resolveThemeKey migrates pre-pack values ("dark"/"light").
  return resolveThemeKey(localStorage.getItem(THEME_STORAGE_KEY));
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getStoredTheme,
    () => "cyberpunk" as Theme,
  );

  // 72 — applied in a layout effect, never during render: a render-time
  // write ran during hydration with the SERVER snapshot ("cyberpunk") and
  // overwrote the pack the boot script had already stamped (a flash on
  // every load for anyone not on the default). Layout effects run before
  // paint, after React has switched to the real client snapshot.
  useIsomorphicLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleSetTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    document.documentElement.setAttribute("data-theme", newTheme);
    // Trigger re-render via storage event
    window.dispatchEvent(new Event("storage"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
