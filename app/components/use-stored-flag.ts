"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Phase 72 — a boolean setting kept in localStorage, read through
 * useSyncExternalStore: the server render and the first client render
 * agree (the server snapshot is the default), so there's no hydration
 * mismatch, and every toggle bound to the same key stays in sync — in
 * this tab (custom event) and across tabs (storage event).
 */
const EVENT = "cascade-stored-flag";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(EVENT, callback);
  };
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * `isOn(raw)` decides how the stored string maps to true (e.g. sounds
 * default ON unless "false"; auto-dispatch default OFF unless "true").
 */
export function useStoredFlag(
  key: string,
  serverDefault: boolean,
  isOn: (raw: string | null) => boolean,
): [boolean, (next: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => isOn(read(key)),
    () => serverDefault,
  );
  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, String(next));
      } catch {
        // private mode: the toggle just won't persist
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
