"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getOverseerSettings } from "@/lib/overseer-settings";

/**
 * Phase 68.5 — the assistant's name and portrait come from the active
 * persona (theme pack / Overseer settings), never a hardcoded "Delamain".
 * The "" server snapshot keeps hydration consistent; the storage event
 * keeps every surface live across pack switches.
 */
const DEFAULT_PERSONA = { name: "Overseer", portraitSrc: "/delamain.jpg" };

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function snapshot(): string {
  try {
    return localStorage.getItem("cascade-overseer") ?? "";
  } catch {
    return "";
  }
}

export function usePersona(): { name: string; portraitSrc: string } {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return useMemo(() => {
    if (!raw) return DEFAULT_PERSONA;
    const s = getOverseerSettings();
    return {
      name: s.name || DEFAULT_PERSONA.name,
      portraitSrc: s.portraitIdle,
    };
  }, [raw]);
}

/** For non-render code (notifications): the persona name right now. */
export function personaNameNow(): string {
  try {
    return getOverseerSettings().name || DEFAULT_PERSONA.name;
  } catch {
    return DEFAULT_PERSONA.name;
  }
}
