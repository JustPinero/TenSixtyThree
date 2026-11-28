export function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-6 bg-space-700 w-48" />
      <div className="h-3 bg-space-700 w-64" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="p-4 border border-space-600 bg-space-800">
            <div className="h-4 bg-space-700 w-2/3 mb-3" />
            <div className="h-3 bg-space-700 w-1/3 mb-3" />
            <div className="flex justify-between">
              <div className="h-3 bg-space-700 w-1/4" />
              <div className="h-3 bg-space-700 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 77 — in-page placeholder while a client page's first fetch is in flight
 * (route-level loading.tsx only covers the server render). Announced to
 * assistive tech as a status, shaped like the content that will replace it.
 */
export function PageSkeleton({
  label,
  variant,
}: {
  label: string;
  variant: "board" | "table" | "list";
}) {
  return (
    <div role="status" aria-label={label} className="animate-pulse">
      <span className="sr-only">{label}</span>
      {variant === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, c) => (
            <div key={c} className="border border-space-600 bg-space-800 p-3 space-y-2">
              <div className="h-3 bg-space-700 w-1/3 mb-3" />
              {Array.from({ length: 3 - c }).map((__, i) => (
                <div key={i} className="h-12 bg-space-700" />
              ))}
            </div>
          ))}
        </div>
      ) : variant === "table" ? (
        <div className="border border-space-600 bg-space-800">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-4 px-4 py-3 border-b border-space-700 last:border-b-0">
              <div className="h-3 bg-space-700 w-1/4" />
              <div className="h-3 bg-space-700 w-1/6" />
              <div className="h-3 bg-space-700 w-1/3" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border border-space-600 bg-space-800 p-4 space-y-2">
              <div className="h-3 bg-space-700 w-1/4" />
              <div className="h-3 bg-space-700 w-2/3" />
              <div className="h-3 bg-space-700 w-1/2" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
