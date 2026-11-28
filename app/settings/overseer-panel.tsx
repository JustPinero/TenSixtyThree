"use client";

/**
 * Settings → Overseer identity (name + portrait). 77: extracted from the
 * settings page; portraits are chosen from the theme packs' portraits,
 * with a custom path behind "Use a custom image".
 */
import { useState } from "react";
import {
  getOverseerSettings,
  setOverseerSettings,
} from "@/lib/overseer-settings";
import { Portrait } from "@/app/components/portrait";
import { THEME_PACKS } from "@/lib/theme-registry";

export function OverseerPanel() {
  const [name, setName] = useState(() => getOverseerSettings().name);
  const [portraitIdle, setPortraitIdle] = useState(
    () => getOverseerSettings().portraitIdle,
  );
  const [portraitTalking, setPortraitTalking] = useState(
    () => getOverseerSettings().portraitTalking ?? "",
  );
  const [usesTalkingFace, setUsesTalkingFace] = useState(
    () => getOverseerSettings().usesTalkingFace,
  );
  const [saved, setSaved] = useState(false);
  // A stored portrait that isn't one of the packs' means a custom image:
  // open that section so the path is visible.
  const [customOpen] = useState(
    () => !THEME_PACKS.some((t) => t.persona.portraitIdle === getOverseerSettings().portraitIdle),
  );

  function handleSave() {
    const trimmedTalking = portraitTalking.trim();
    setOverseerSettings({
      name: name.trim() || "Overseer",
      portraitIdle: portraitIdle.trim() || "/delamain.jpg",
      // Empty string clears it (single-face mode); non-empty stores it.
      portraitTalking: trimmedTalking ? trimmedTalking : null,
      usesTalkingFace,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div id="settings-assistant" className="mb-8 scroll-mt-20">
      <h2 className="text-sm font-mono font-bold text-cyan uppercase tracking-wider mb-4">
        Overseer Identity
      </h2>
      <div className="space-y-3">
        <div className="p-3 border border-space-600 bg-space-800">
          <label
            htmlFor="overseer-name"
            className="text-sm font-mono text-text-bright block mb-2"
          >
            Name
          </label>
          <input
            id="overseer-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
            placeholder="Overseer"
            className="w-full px-3 py-1.5 text-sm font-mono input"
          />
          <p className="text-micro font-mono text-muted mt-1">
            Your AI dispatcher&apos;s name. Appears in chat, sidebar, and
            briefings.
          </p>
        </div>

        {/* 77 — pick a portrait instead of typing a file path; a custom
            image is still one click away. */}
        <fieldset className="p-3 border border-space-600 bg-space-800">
          <legend className="text-sm font-mono text-text-bright px-1">
            Portrait
          </legend>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a portrait">
            {THEME_PACKS.map((t) => {
              const selected = portraitIdle === t.persona.portraitIdle;
              return (
                <button
                  key={t.key}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`Use the ${t.persona.name} portrait`}
                  onClick={() => {
                    setPortraitIdle(t.persona.portraitIdle);
                    setPortraitTalking(t.persona.portraitTalking ?? "");
                    setUsesTalkingFace(Boolean(t.persona.portraitTalking));
                  }}
                  className={`w-12 h-12 rounded border overflow-hidden bg-space-900 focus-ring ${
                    selected ? "border-cyan ring-1 ring-cyan" : "border-space-600 hover:border-cyan/60"
                  }`}
                >
                  <Portrait
                    src={t.persona.portraitIdle}
                    alt=""
                    size="md"
                    className="w-full h-full object-cover"
                  />
                </button>
              );
            })}
          </div>

          <details className="mt-3" open={customOpen}>
            <summary className="text-xs font-mono text-text-dim cursor-pointer min-h-6 inline-flex items-center focus-ring">
              Use a custom image
            </summary>
            <div className="mt-2 space-y-3">
              <div>
                <label
                  htmlFor="overseer-portrait-idle"
                  className="text-xs font-mono text-text block mb-1"
                >
                  Idle portrait (path or URL)
                </label>
                <div className="flex gap-3 items-start">
                  <div className="w-12 h-12 rounded border border-space-600 overflow-hidden bg-space-900 shrink-0">
                    <Portrait
                      src={portraitIdle}
                      alt="idle preview"
                      size="md"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <input
                    id="overseer-portrait-idle"
                    type="text"
                    value={portraitIdle}
                    onChange={(e) => setPortraitIdle(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSave()}
                    placeholder="/delamain.jpg"
                    className="flex-1 min-w-0 px-3 py-1.5 text-sm font-mono input"
                  />
                </div>
              </div>
              <label className="flex items-center gap-3 min-h-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={usesTalkingFace}
                  onChange={(e) => setUsesTalkingFace(e.target.checked)}
                  className="accent-cyan size-4"
                />
                <span className="text-xs font-mono text-text">
                  Use a separate portrait while responding
                </span>
              </label>
              {usesTalkingFace && (
                <div>
                  <label
                    htmlFor="overseer-portrait-talking"
                    className="text-xs font-mono text-text block mb-1"
                  >
                    Talking portrait (path or URL)
                  </label>
                  <div className="flex gap-3 items-start">
                    <div className="w-12 h-12 rounded border border-space-600 overflow-hidden bg-space-900 shrink-0">
                      <Portrait
                        src={portraitTalking}
                        alt="talking preview"
                        size="md"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <input
                      id="overseer-portrait-talking"
                      type="text"
                      value={portraitTalking}
                      onChange={(e) => setPortraitTalking(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSave()}
                      placeholder="/delamain-talking.jpg"
                      className="flex-1 min-w-0 px-3 py-1.5 text-sm font-mono input"
                    />
                  </div>
                </div>
              )}
            </div>
          </details>
        </fieldset>

        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs font-mono border border-cyan text-cyan hover:bg-cyan/10 transition-colors"
          >
            {saved ? "Saved" : "Save Identity"}
          </button>
        </div>
      </div>
    </div>
  );
}
