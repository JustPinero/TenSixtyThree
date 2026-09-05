/**
 * Apply a theme pack — Phase 53. Client-side only (localStorage).
 *
 * Applying a pack switches the visual theme and, when the user hasn't
 * hand-customized their assistant, swaps in the pack's persona too.
 * A customized persona (name or portraits changed away from factory
 * defaults and every pack preset) is never overwritten.
 */

import { getThemePack, THEME_PACKS } from "./theme-registry";
import {
  getOverseerSettings,
  setOverseerSettings,
  type OverseerSettings,
} from "./overseer-settings";

/** Factory persona from before theme packs existed (overseer-settings DEFAULTS). */
const FACTORY_PERSONA = {
  name: "Overseer",
  portraitIdle: "/delamain.jpg",
  portraitTalking: "/delamain-talking.jpg" as string | null,
};

type PersonaShape = Pick<
  OverseerSettings,
  "name" | "portraitIdle" | "portraitTalking"
>;

function personaEquals(a: PersonaShape, b: PersonaShape): boolean {
  return (
    a.name === b.name &&
    a.portraitIdle === b.portraitIdle &&
    a.portraitTalking === b.portraitTalking
  );
}

/**
 * A persona is "pristine" when it's the factory default or exactly a
 * pack preset — i.e. the user never hand-tuned it, so a pack switch
 * may freely restyle the assistant.
 */
export function shouldApplyPersona(current: OverseerSettings): boolean {
  if (personaEquals(current, FACTORY_PERSONA)) return true;
  return THEME_PACKS.some((pack) => personaEquals(current, pack.persona));
}

/**
 * First installed speech voice whose name contains one of the preferred
 * substrings (case-insensitive), as a partial settings update — empty
 * when nothing matches (or speechSynthesis is unavailable) so the
 * current voiceURI survives the merge.
 */
function matchPreferredVoice(
  preferred: string[],
): Partial<Pick<OverseerSettings, "voiceURI">> {
  if (preferred.length === 0 || typeof window === "undefined") return {};
  const synth = window.speechSynthesis;
  if (!synth) return {};
  const voices = synth.getVoices();
  for (const want of preferred) {
    const hit = voices.find((v) =>
      v.name.toLowerCase().includes(want.toLowerCase()),
    );
    if (hit) return { voiceURI: hit.voiceURI };
  }
  return {};
}

/**
 * Switch to a theme pack: persist + stamp the theme, and apply the
 * pack persona unless the user has a hand-customized assistant.
 * Unknown keys are ignored.
 */
export function applyThemePack(key: string): void {
  const pack = getThemePack(key);
  if (!pack || typeof window === "undefined") return;

  if (shouldApplyPersona(getOverseerSettings())) {
    setOverseerSettings({
      name: pack.persona.name,
      portraitIdle: pack.persona.portraitIdle,
      portraitTalking: pack.persona.portraitTalking,
      personality: pack.persona.personality,
      // 53.2 — voice defaults ride along with the persona. Never flips
      // voiceEnabled: speaking stays opt-in.
      voiceRate: pack.persona.voice.rate,
      voicePitch: pack.persona.voice.pitch,
      ...matchPreferredVoice(pack.persona.voice.preferredVoices),
    });
  }

  localStorage.setItem("cascade-theme", pack.key);
  document.documentElement.setAttribute("data-theme", pack.key);
  // Same re-render signal ThemeProvider's setTheme uses.
  window.dispatchEvent(new Event("storage"));
}
