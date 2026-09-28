import type { WizardState } from "./wizard-shell";
import { Toggle } from "@/app/components/ui/toggle";

interface GithubStepProps {
  state: WizardState;
  onChange: (updates: Partial<WizardState>) => void;
}

export function GithubStep({ state, onChange }: GithubStepProps) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold font-mono text-text-bright">
        GitHub Repository
      </h2>

      <div className="flex items-center gap-3">
        <Toggle
          label="Create a GitHub repository"
          checked={state.createGithubRepo}
          onChange={(next) => onChange({ createGithubRepo: next })}
        />
        <span className="text-sm font-mono text-text">
          Create GitHub repository
        </span>
      </div>

      {state.createGithubRepo && (
        <div className="space-y-4 pl-4 border-l border-space-600">
          <div className="flex items-center gap-3">
            <button
              onClick={() => onChange({ isPrivate: true })}
              className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
                state.isPrivate
                  ? "border-cyan text-cyan bg-cyan/8"
                  : "border-space-600 text-muted hover:text-text"
              }`}
            >
              Private
            </button>
            <button
              onClick={() => onChange({ isPrivate: false })}
              className={`px-3 py-1.5 text-xs font-mono border transition-colors ${
                !state.isPrivate
                  ? "border-cyan text-cyan bg-cyan/8"
                  : "border-space-600 text-muted hover:text-text"
              }`}
            >
              Public
            </button>
          </div>
          <p className="text-xs font-mono text-muted">
            Requires gh CLI authenticated. Run `gh auth login` if needed.
          </p>
        </div>
      )}
    </div>
  );
}
