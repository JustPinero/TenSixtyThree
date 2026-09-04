"use client";

import {
  createContext,
  useContext,
  useSyncExternalStore,
  useCallback,
} from "react";
import { resolveThemeKey, type ThemeKey } from "@/lib/theme-registry";

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
  return resolveThemeKey(localStorage.getItem("cascade-theme"));
}

function subscribeToTheme(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getStoredTheme,
    () => "cyberpunk" as Theme,
  );

  // Apply data-theme attribute
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", theme);
  }

  const handleSetTheme = useCallback((newTheme: Theme) => {
    localStorage.setItem("cascade-theme", newTheme);
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
