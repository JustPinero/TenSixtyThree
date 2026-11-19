interface StepIndicatorProps {
  steps: string[];
  currentStep: number;
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <>
    {/* 71.3 — seven 60px steps cannot fit a phone; below sm show a
        compact "Step n of 7" line and keep the full stepper from sm up. */}
    <p className="sm:hidden mb-6 text-xs font-mono uppercase tracking-wider text-text" aria-live="polite">
      Step {Math.min(currentStep, steps.length - 1) + 1} of {steps.length}
      <span className="text-cyan"> · {steps[Math.min(currentStep, steps.length - 1)]}</span>
    </p>
    <div className="hidden sm:flex items-center gap-1 mb-8 overflow-x-auto pb-2">
      {steps.map((label, i) => {
        const isComplete = i < currentStep;
        const isCurrent = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center min-w-[60px]">
              <div
                className={`
                  w-8 h-8 flex items-center justify-center text-xs font-mono font-bold
                  border transition-all duration-300
                  ${
                    isComplete
                      ? "border-success bg-success/10 text-success"
                      : isCurrent
                        ? "border-cyan bg-cyan/10 text-cyan pulse-healthy"
                        : "border-space-600 bg-space-800 text-muted"
                  }
                `}
              >
                {isComplete ? ">" : i + 1}
              </div>
              <span
                className={`text-micro font-mono mt-1 text-center ${
                  isCurrent
                    ? "text-cyan"
                    : isFuture
                      ? "text-muted"
                      : "text-text"
                }`}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`w-6 h-px mx-0.5 mt-[-16px] ${
                  isComplete ? "bg-success" : "bg-space-600"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
    </>
  );
}
