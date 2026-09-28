"use client";

/**
 * Accessible on/off switch (Phase 62.2).
 *
 * Replaces 5 hand-rolled toggles that were a bare <button> wrapping a
 * decorative <div>: no role, no accessible name, no state. Screen readers
 * announced them as an unlabeled "button".
 *
 * A real <button> (not a div) so Space/Enter activate natively.
 */
import { useId } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name. Required — an unlabeled switch is the bug this fixes. */
  label: string;
  disabled?: boolean;
  /** Shown and announced when disabled, so the reason isn't visual-only. */
  disabledReason?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
  disabledReason,
}: ToggleProps) {
  const reasonId = useId();
  const showReason = disabled && !!disabledReason;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={showReason ? reasonId : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`w-10 h-5 rounded-full transition-colors relative focus-ring ${
          checked ? "bg-cyan" : "bg-space-600"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-space-900 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
      {showReason && (
        <span id={reasonId} className="text-xs font-mono text-muted">
          {disabledReason}
        </span>
      )}
    </div>
  );
}
