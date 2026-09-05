"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TOUR_STEPS } from "@/lib/tour-steps";
import { THEME_PACKS } from "@/lib/theme-registry";
import { applyThemePack } from "@/lib/theme-pack-apply";
import { getOverseerSettings } from "@/lib/overseer-settings";
import { speak } from "@/lib/speak";
import { Portrait } from "./portrait";

/**
 * 54.6 — the persona-guided demo tour. Hand-rolled spotlight: a fixed
 * ring around the target (giant box-shadow) + the chosen assistant's
 * chat bubble. Progress lives in sessionStorage so steps can route
 * across pages. Starts only in demo sessions arriving with ?demo=1.
 */

const STATE_KEY = "cascade-demo-tour"; // "picker" | step index | "done"

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function readState(): string | null {
  try {
    return sessionStorage.getItem(STATE_KEY);
  } catch {
    return null;
  }
}
function writeState(value: string) {
  try {
    sessionStorage.setItem(STATE_KEY, value);
  } catch {
    /* per-viewer convenience only */
  }
}

function ThemePicker({ onPicked }: { onPicked: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-space-800 border border-cyan glow-border p-6 max-h-[80vh] overflow-y-auto">
        <h2 className="text-lg font-mono font-bold text-cyan uppercase tracking-wider mb-1">
          Choose your guide
        </h2>
        <p className="text-xs font-mono text-text-dim mb-4">
          Every theme pack bundles a look and an assistant. Pick one — it will
          walk you through the demo.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEME_PACKS.map((pack) => (
            <button
              key={pack.key}
              onClick={() => {
                applyThemePack(pack.key);
                onPicked();
              }}
              className="p-3 border border-space-600 bg-space-900 hover:border-cyan text-left"
            >
              <div className="w-12 h-12 rounded border border-space-600 overflow-hidden mb-2">
                <Portrait
                  src={pack.persona.portraitIdle}
                  alt={`${pack.persona.name} portrait`}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-sm font-mono font-bold text-text-bright">
                {pack.persona.name}
              </p>
              <p className="text-[10px] font-mono text-text-dim">
                {pack.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TourInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [demo, setDemo] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  // Arm only for demo sessions.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.demo) return;
        setDemo(true);
        const existing = readState();
        if (existing) {
          setState(existing);
        } else if (searchParams.get("demo") === "1") {
          writeState("picker");
          setState("picker");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stepIndex = state !== null && /^\d+$/.test(state) ? Number(state) : -1;
  const step = stepIndex >= 0 ? TOUR_STEPS[stepIndex] : null;

  // Route + measure the current step's target.
  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  useEffect(() => {
    if (!step) return;
    if (pathname !== step.route) {
      router.push(step.route);
      return;
    }
    // Element may mount after data loads — retry briefly.
    setRect(null);
    const tries = [100, 400, 900, 1600];
    const timers = tries.map((ms) => setTimeout(measure, ms));
    window.addEventListener("resize", measure);
    const persona = getOverseerSettings();
    if (persona.voiceEnabled) speak(step.text, persona);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", measure);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pathname]);

  if (!demo || state === null || state === "done") return null;

  if (state === "picker") {
    return (
      <ThemePicker
        onPicked={() => {
          writeState("0");
          setState("0");
        }}
      />
    );
  }
  if (!step) return null;

  const persona = getOverseerSettings();
  const go = (next: number) => {
    if (next >= TOUR_STEPS.length) {
      writeState("done");
      setState("done");
      return;
    }
    const value = String(Math.max(0, next));
    writeState(value);
    setState(value);
  };

  const bubbleTop = rect
    ? Math.min(rect.top + rect.height + 12, window.innerHeight - 220)
    : 120;
  const bubbleLeft = rect
    ? Math.min(Math.max(rect.left, 16), window.innerWidth - 360)
    : 120;

  return (
    <>
      {rect && (
        <div
          aria-hidden
          className="fixed z-40 pointer-events-none border-2 border-cyan rounded shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}
      <div
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        className="fixed z-50 w-80 bg-space-800 border border-cyan glow-border p-3"
        style={{ top: bubbleTop, left: bubbleLeft }}
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded border border-space-600 overflow-hidden shrink-0 delamain-talking">
            <Portrait
              src={persona.portraitIdle}
              alt={`${persona.name} portrait`}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <p className="text-xs font-mono font-bold text-cyan uppercase tracking-wider">
              {persona.name} · {step.title}
            </p>
            <p className="text-xs font-mono text-text mt-1">{step.text}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => go(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="border border-space-600 px-2 py-1 text-xs font-mono text-text-dim disabled:opacity-40"
          >
            Back
          </button>
          <button
            onClick={() => go(stepIndex + 1)}
            className="border border-cyan px-3 py-1 text-xs font-mono uppercase text-cyan"
          >
            {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
          </button>
          <span className="text-[10px] font-mono text-text-dim">
            {stepIndex + 1}/{TOUR_STEPS.length}
          </span>
          <button
            onClick={() => go(TOUR_STEPS.length)}
            className="ml-auto text-xs font-mono text-text-dim hover:text-text"
          >
            End tour
          </button>
        </div>
      </div>
    </>
  );
}

export function DemoTour() {
  return (
    <Suspense fallback={null}>
      <TourInner />
    </Suspense>
  );
}
