/**
 * Theme Pack registry — Phase 53.
 *
 * A theme pack bundles a full visual theme (a [data-theme] CSS variable
 * block in app/globals.css) with a matching prebuilt assistant persona.
 * The 12 packs come from the April 2026 design doc
 * (~/Desktop/LeonardoPrompts/Cascade/portrait-prompts.md); portraits are
 * generated in Leonardo and dropped at public/portraits/<key>/{idle,talking}.jpg
 * — until they exist, <Portrait/> renders its neutral SVG fallback.
 *
 * lib/theme-css.test.ts pins every key here to a real CSS block.
 */

export type ThemeKey =
  | "sunny"
  | "cyberpunk"
  | "console"
  | "cog"
  | "sprite"
  | "margin"
  | "curator"
  | "sage"
  | "pilot"
  | "pixel"
  | "quiet"
  | "specter";

export interface ThemeVoice {
  /** Web Speech API rate/pitch defaults, clamped 0-2 by speak(). */
  rate: number;
  pitch: number;
  /** Case-insensitive substrings matched against installed voice names;
   *  first match wins. Empty = keep the browser default. */
  preferredVoices: string[];
}

export interface ThemePersona {
  name: string;
  portraitIdle: string;
  portraitTalking: string | null;
  personality: string | null;
  voice: ThemeVoice;
}

export interface ThemePack {
  key: ThemeKey;
  label: string;
  description: string;
  /** Four swatches for the settings-page preview card. */
  preview: [string, string, string, string];
  persona: ThemePersona;
}

function portraits(
  key: ThemeKey,
): Pick<ThemePersona, "portraitIdle" | "portraitTalking"> {
  return {
    portraitIdle: `/portraits/${key}/idle.jpg`,
    portraitTalking: `/portraits/${key}/talking.jpg`,
  };
}

export const THEME_PACKS: readonly ThemePack[] = [
  {
    key: "sunny",
    label: "Sunny",
    description: "Friendly light default — bright, warm, zero intimidation",
    preview: ["#f0f2f5", "#ffffff", "#1a8a99", "#c49030"],
    persona: {
      name: "Sunny",
      voice: { rate: 1.05, pitch: 1.2, preferredVoices: ["Samantha", "Google US English", "Zira"] },
      ...portraits("sunny"),
      personality:
        "Warm, encouraging, and plain-spoken. Explains without jargon and celebrates small wins.",
    },
  },
  {
    key: "cyberpunk",
    label: "Cyberpunk",
    description:
      "Tactical AI dispatcher — the original TenSixtyThree aesthetic",
    preview: ["#060910", "#111620", "#41a6b5", "#e0af68"],
    persona: {
      name: "Delamain",
      voice: { rate: 1.0, pitch: 0.9, preferredVoices: ["Daniel", "Google UK English Male", "David"] },
      portraitIdle: "/delamain.jpg",
      portraitTalking: "/delamain-talking.jpg",
      personality: null,
    },
  },
  {
    key: "console",
    label: "Console",
    description: "Retro terminal — vt100 phosphor, MS-DOS BBS energy",
    preview: ["#050805", "#0a120a", "#4be36b", "#d8c548"],
    persona: {
      name: "Console",
      voice: { rate: 1.15, pitch: 0.8, preferredVoices: ["Fred", "Zarvox", "Google US English"] },
      ...portraits("console"),
      personality:
        "Terse sysop. Answers in short lines, all business, dry humor in the comments.",
    },
  },
  {
    key: "cog",
    label: "Cog",
    description: "Soft steampunk — cartoon-noir gears, brass and brown",
    preview: ["#1c1410", "#2a1f17", "#c98a3d", "#b5764a"],
    persona: {
      name: "Cog",
      voice: { rate: 0.95, pitch: 0.85, preferredVoices: ["Daniel", "Fred", "David"] },
      // Talking cue is an eye-widen, not a mouth (img2img from the idle —
      // the eye fills the hub, there's no room for a mouth; curator-style
      // mood cue per the design doc).
      ...portraits("cog"),
      personality:
        "Gruff-but-kind workshop foreman. Practical, hands-on, fond of mechanical metaphors.",
    },
  },
  {
    key: "sprite",
    label: "Sprite",
    description: "Y2K aero — frosted glass and bubble-tea pastels",
    preview: ["#eef3fb", "#ffffff", "#5aa5e8", "#e88ac2"],
    persona: {
      name: "Sprite",
      voice: { rate: 1.1, pitch: 1.3, preferredVoices: ["Samantha", "Karen", "Zira"] },
      ...portraits("sprite"),
      personality:
        "Bubbly and quick. Upbeat, playful, keeps things light without losing the thread.",
    },
  },
  {
    key: "margin",
    label: "Margin",
    description: "Notebook sketchpad — cream paper, navy ink doodles",
    preview: ["#f7f3e8", "#fffdf5", "#2c4a7c", "#c0563a"],
    persona: {
      name: "Margin",
      voice: { rate: 1.0, pitch: 1.05, preferredVoices: ["Samantha", "Google US English"] },
      ...portraits("margin"),
      personality:
        "Thinks out loud in the margins. Sketches ideas, asks good questions, informal.",
    },
  },
  {
    key: "curator",
    label: "Curator",
    description: "Library academic — leather-bound cream, burgundy, gold",
    preview: ["#f2ebdd", "#faf6ec", "#7c2d3a", "#a8862e"],
    persona: {
      name: "Curator",
      voice: { rate: 0.9, pitch: 0.95, preferredVoices: ["Daniel", "Serena", "Google UK English Female"] },
      ...portraits("curator"),
      personality:
        "Measured and scholarly. Cites precedent, values precision, never rushes.",
    },
  },
  {
    key: "sage",
    label: "Sage",
    description:
      "Forest calm — sage green and terracotta, organic and grounded",
    preview: ["#eef0e9", "#f8f9f4", "#3e6b4a", "#b96a4b"],
    persona: {
      name: "Sage",
      voice: { rate: 0.9, pitch: 0.9, preferredVoices: ["Karen", "Serena", "Samantha"] },
      ...portraits("sage"),
      personality:
        "Calm and grounded. Slows things down, weighs tradeoffs, favors sustainable pace.",
    },
  },
  {
    key: "pilot",
    label: "Pilot",
    description:
      "Clean sci-fi — white and electric blue, mission-control crisp",
    preview: ["#f4f7fa", "#ffffff", "#1f6ff2", "#5089d8"],
    persona: {
      name: "Pilot",
      voice: { rate: 1.0, pitch: 0.95, preferredVoices: ["Alex", "Google US English", "David"] },
      ...portraits("pilot"),
      personality:
        "Crisp mission-control cadence. Checklists, clear callouts, calm under pressure.",
    },
  },
  {
    key: "pixel",
    label: "Pixel",
    description: "Saturday-morning cartoon — bright primaries, low stakes",
    preview: ["#fdf6ea", "#ffffff", "#e8483f", "#2f6fd8"],
    persona: {
      name: "Pixel",
      voice: { rate: 1.2, pitch: 1.35, preferredVoices: ["Junior", "Samantha", "Zira"] },
      ...portraits("pixel"),
      personality:
        "90s-cartoon sidekick energy. Enthusiastic, a little goofy, always game.",
    },
  },
  {
    key: "quiet",
    label: "Quiet",
    description: "Minimalist — neutral, noiseless, nothing but the work",
    preview: ["#fafafa", "#ffffff", "#4a4a52", "#8a8a94"],
    persona: {
      name: "Overseer",
      voice: { rate: 1.0, pitch: 1.0, preferredVoices: [] },
      ...portraits("quiet"),
      personality:
        "No persona. Neutral, concise, invisible — the work is the interface.",
    },
  },
  {
    key: "specter",
    label: "Specter",
    description:
      "Playful-spooky — Halloween goth, purple dusk and ember orange",
    preview: ["#0d0812", "#171021", "#9b5de5", "#f28c28"],
    persona: {
      name: "Specter",
      voice: { rate: 0.85, pitch: 0.7, preferredVoices: ["Whisper", "Daniel", "Google UK English Male"] },
      ...portraits("specter"),
      personality:
        "Playfully spooky. Deadpan gothic wit, delights in haunting flaky tests.",
    },
  },
];

export const THEME_KEYS: readonly ThemeKey[] = THEME_PACKS.map((p) => p.key);

export function getThemePack(key: string): ThemePack | null {
  return THEME_PACKS.find((p) => p.key === key) ?? null;
}

/**
 * Resolve a stored theme value to a valid key. Migrates the pre-53
 * two-theme values ("dark"/"light") and falls back to cyberpunk —
 * the historical default — for anything unrecognized.
 */
export function resolveThemeKey(stored: string | null): ThemeKey {
  if (stored === "dark") return "cyberpunk";
  if (stored === "light") return "sunny";
  const pack = stored ? getThemePack(stored) : null;
  return pack ? pack.key : "cyberpunk";
}
