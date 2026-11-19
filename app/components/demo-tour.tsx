"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { TOUR_STEPS, type TourStep } from "@/lib/tour-steps";
import { THEME_PACKS } from "@/lib/theme-registry";
import { applyThemePack } from "@/lib/theme-pack-apply";
import { getOverseerSettings } from "@/lib/overseer-settings";
import { speak } from "@/lib/speak";
import { Portrait } from "./portrait";
import { tourBubblePosition, highlightRect } from "@/lib/tour-position";

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

function ThemePicker({
  onPicked,
  onSkip,
}: {
  onPicked: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 sm:p-6">
      <div
        role="dialog"
        aria-labelledby="tour-picker-title"
        className="max-w-2xl w-full bg-space-800 border border-cyan glow-border p-4 sm:p-6 max-h-[85dvh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2
            id="tour-picker-title"
            className="text-lg font-mono font-bold text-cyan uppercase tracking-wider"
          >
            Choose your guide
          </h2>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 min-h-11 sm:min-h-8 px-3 text-xs font-mono text-text-dim hover:text-text focus-ring"
          >
            Skip tour
          </button>
        </div>
        <p className="text-xs font-mono text-text-dim mb-4">
          Every theme pack bundles a look and an assistant. Pick one — it will
          walk you through the demo.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {THEME_PACKS.map((pack) => (
            <button
              key={pack.key}
              type="button"
              onClick={() => {
                applyThemePack(pack.key);
                onPicked();
              }}
              className="p-3 border border-space-600 bg-space-900 hover:border-cyan text-left min-w-0 focus-ring"
            >
              <div className="w-12 h-12 rounded border border-space-600 overflow-hidden mb-2">
                <Portrait
                  src={pack.persona.portraitIdle}
                  alt={`${pack.persona.name} portrait`}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-sm font-mono font-bold text-text-bright truncate">
                {pack.persona.name}
              </p>
              <p className="text-micro font-mono text-text-dim truncate">
                {pack.label}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** On screen horizontally? (The closed mobile drawer sits at x < 0.) */
function onCanvas(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
}

function resolveTarget(step: TourStep): Element | null {
  const el = document.querySelector(step.selector);
  if (el && onCanvas(el)) return el;
  // 71.2 — e.g. the Overseer link lives in the closed drawer below lg:
  // point at the menu button instead.
  if (step.mobileSelector) {
    const alt = document.querySelector(step.mobileSelector);
    if (alt && onCanvas(alt)) return alt;
  }
  return el;
}

function TourInner() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [demo, setDemo] = useState(false);
  const [state, setState] = useState<string | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState({ width: 1440, height: 900 });
  const [bubbleHeight, setBubbleHeight] = useState(220);
  const [paused, setPaused] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  /** Route we pushed ourselves — not a visitor navigating away. */
  const pendingRoute = useRef<string | null>(null);

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

  const measure = useCallback(() => {
    setViewport({ width: window.innerWidth, height: window.innerHeight });
    if (!step) return;
    const el = resolveTarget(step);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  /** 71.1 — bring the target on screen before placing the bubble. */
  const scrollToTarget = useCallback(() => {
    if (!step) return;
    const el = resolveTarget(step);
    if (el) {
      const r = el.getBoundingClientRect();
      const offScreen = r.top < 0 || r.bottom > window.innerHeight;
      if (offScreen && onCanvas(el)) {
        el.scrollIntoView({
          block: r.height > window.innerHeight * 0.8 ? "start" : "center",
          behavior: "auto",
        });
      }
    }
    measure();
  }, [step, measure]);

  useEffect(() => {
    if (!step) return;
    if (pathname !== step.route) {
      // 71.2 — never drag the visitor back. Our own push is in flight
      // only when pendingRoute says so; otherwise they navigated away.
      if (pendingRoute.current !== step.route) setPaused(true);
      return;
    }
    pendingRoute.current = null;
    setPaused(false);
    setRect(null);
    // Element may mount after data loads — retry briefly.
    const timers = [100, 400, 900, 1600].map((ms) => setTimeout(scrollToTarget, ms));
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener("resize", onMove);
    // capture: <main> is the scroll container, not the window.
    window.addEventListener("scroll", onMove, { capture: true, passive: true });
    const persona = getOverseerSettings();
    if (persona.voiceEnabled) speak(step.text, persona);
    return () => {
      timers.forEach(clearTimeout);
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pathname]);

  // 71.1 — place against the bubble's real height, not a constant.
  useEffect(() => {
    const el = bubbleRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setBubbleHeight(el.scrollHeight));
    observer.observe(el);
    setBubbleHeight(el.scrollHeight);
    return () => observer.disconnect();
  }, [step, paused]);

  const end = useCallback(() => {
    writeState("done");
    setState("done");
  }, []);

  // 71.2 — focus moves into the bubble each step; Escape ends the tour.
  useEffect(() => {
    if (!step || paused) return;
    bubbleRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [step, paused, end]);

  if (!demo || state === null || state === "done") return null;

  if (state === "picker") {
    return (
      <ThemePicker
        onPicked={() => {
          writeState("0");
          setState("0");
        }}
        onSkip={end}
      />
    );
  }
  if (!step) return null;

  const goToRoute = (route: string) => {
    if (route !== pathname) {
      pendingRoute.current = route;
      router.push(route);
    }
  };

  const go = (next: number) => {
    if (next >= TOUR_STEPS.length) {
      end();
      return;
    }
    const index = Math.max(0, next);
    writeState(String(index));
    setState(String(index));
    goToRoute(TOUR_STEPS[index].route);
  };

  if (paused) {
    return (
      <div className="fixed z-50 bottom-4 right-4 flex items-center gap-2 bg-space-800 border border-cyan glow-border p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => {
            setPaused(false);
            goToRoute(step.route);
          }}
          className="min-h-11 sm:min-h-8 px-3 text-xs font-mono uppercase text-cyan border border-cyan focus-ring"
        >
          Resume tour ({stepIndex + 1}/{TOUR_STEPS.length})
        </button>
        <button
          type="button"
          onClick={end}
          className="min-h-11 sm:min-h-8 px-3 text-xs font-mono text-text-dim hover:text-text focus-ring"
        >
          End
        </button>
      </div>
    );
  }

  const persona = getOverseerSettings();
  const bubble = tourBubblePosition(rect, viewport, bubbleHeight);
  const spot = bubble.mode === "centered" ? null : highlightRect(rect, viewport);
  const isSheet = bubble.mode === "sheet";

  return (
    <>
      {spot && (
        <div
          aria-hidden
          className="fixed z-40 pointer-events-none border-2 border-cyan rounded shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{
            top: spot.top - 6,
            left: spot.left - 6,
            width: spot.width + 12,
            height: spot.height + 12,
          }}
        />
      )}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-label={`Tour: ${step.title}`}
        tabIndex={-1}
        className={`fixed z-50 bg-space-800 border-cyan glow-border overflow-y-auto outline-none ${
          isSheet
            ? "inset-x-0 bottom-0 border-t p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            : "border p-3"
        }`}
        style={
          isSheet
            ? { maxHeight: bubble.maxHeight }
            : {
                top: bubble.top,
                left: bubble.left,
                width: bubble.width,
                maxHeight: bubble.maxHeight,
              }
        }
      >
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded border border-space-600 overflow-hidden shrink-0 delamain-talking">
            <Portrait
              src={persona.portraitIdle}
              alt={`${persona.name} portrait`}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-mono font-bold text-cyan uppercase tracking-wider">
              {persona.name} · {step.title}
            </p>
            <p className="text-xs font-mono text-text mt-1">{step.text}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <button
            type="button"
            onClick={() => go(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="min-h-11 sm:min-h-8 border border-space-600 px-3 text-xs font-mono text-text-dim disabled:opacity-40 focus-ring"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => go(stepIndex + 1)}
            className="min-h-11 sm:min-h-8 border border-cyan px-4 text-xs font-mono uppercase text-cyan focus-ring"
          >
            {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
          </button>
          <span className="text-micro font-mono text-text-dim">
            {stepIndex + 1}/{TOUR_STEPS.length}
          </span>
          <button
            type="button"
            onClick={end}
            className="ml-auto min-h-11 sm:min-h-8 px-3 text-xs font-mono text-text-dim hover:text-text focus-ring"
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
