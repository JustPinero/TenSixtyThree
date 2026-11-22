interface GapSuggestion {
  category: string;
  count: number;
  suggestion: string;
  priority: "high" | "medium" | "low";
}

interface GapSuggestionsProps {
  suggestions: GapSuggestion[];
  /**
   * 72 — with an empty knowledge base every category is a "gap"; showing
   * them as red [HIGH] alerts reads as an error. Neutral = ideas to start.
   */
  neutral?: boolean;
}

const priorityColors = {
  high: "border-danger/40 text-danger",
  medium: "border-amber/40 text-amber",
  low: "border-info/40 text-info",
};

export function GapSuggestions({ suggestions, neutral = false }: GapSuggestionsProps) {
  if (suggestions.length === 0) return null;

  if (neutral) {
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-mono uppercase tracking-widest text-accent">
          Ideas to start your knowledge base
        </h3>
        <ul className="space-y-1">
          {suggestions.map((s) => (
            <li key={s.category} className="p-2 border border-space-600 text-xs font-mono text-text">
              {s.suggestion}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-mono uppercase tracking-widest text-accent">
        Knowledge Gaps
      </h3>
      {suggestions.map((s) => (
        <div
          key={s.category}
          className={`p-2 border text-xs font-mono ${priorityColors[s.priority]}`}
        >
          <span className="text-micro uppercase">[{s.priority}]</span>{" "}
          {s.suggestion}
        </div>
      ))}
    </div>
  );
}
