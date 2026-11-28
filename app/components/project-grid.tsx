"use client";

import { ProjectTile, type ProjectTileData } from "./project-tile";
import { FirstRunPanel } from "./first-run-panel";

interface ProjectGridProps {
  projects: ProjectTileData[];
  loading: boolean;
  groupBy?: "none" | "status";
  /** 68.2 — projects before filters; 0 means a brand-new account. */
  totalCount?: number;
  /** 68.2 — the list failed to load (not the same as "empty"). */
  loadError?: boolean;
  onRetry?: () => void;
  onConnected?: () => void;
}

function SkeletonTile() {
  return (
    <div className="p-4 border border-space-600 bg-space-800 animate-pulse">
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 bg-space-600 rounded w-2/3" />
        <div className="h-3 w-3 bg-space-600 rounded-full" />
      </div>
      <div className="h-3 bg-space-600 rounded w-1/3 mb-3" />
      <div className="flex justify-between">
        <div className="h-3 bg-space-600 rounded w-1/4" />
        <div className="h-3 bg-space-600 rounded w-1/4" />
      </div>
      <div className="mt-3 pt-3 border-t border-space-600/50">
        <div className="h-2 bg-space-600 rounded w-1/5" />
      </div>
    </div>
  );
}

const statusLabels: Record<string, string> = {
  building: "Active Build",
  deployed: "Deployed",
  paused: "Paused",
  archived: "Archived",
};

/**
 * 77 — columns fit the space: a small fleet's tiles stretch across the row
 * instead of sitting in two narrow cells of a four-column grid, and a big
 * fleet still wraps at ~15rem per tile.
 */
export const GRID_CLASS =
  "grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3";

export function ProjectGrid({
  projects,
  loading,
  groupBy = "none",
  totalCount,
  loadError = false,
  onRetry,
  onConnected,
}: ProjectGridProps) {
  if (loading) {
    return (
      <div className={GRID_CLASS}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="p-8 border border-danger bg-space-800 text-center space-y-3">
        <p className="text-sm text-text font-mono">Couldn&apos;t load your projects.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="min-h-6 border border-cyan px-3 py-1.5 text-xs font-mono uppercase text-cyan hover:bg-cyan/10 focus-ring"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  if (projects.length === 0 && totalCount === 0) {
    return <FirstRunPanel onConnected={onConnected} />;
  }

  if (projects.length === 0) {
    return (
      <div className="p-8 border border-space-600 bg-space-800 glow-border text-center">
        <p className="text-sm text-text font-mono">
          No projects match your filters. Try adjusting your search or clearing
          filters.
        </p>
      </div>
    );
  }

  if (groupBy === "status") {
    const groups = new Map<string, ProjectTileData[]>();
    for (const p of projects) {
      const list = groups.get(p.status) || [];
      list.push(p);
      groups.set(p.status, list);
    }

    // Sort groups: building first, then deployed, paused, archived
    const order = ["building", "deployed", "paused", "archived"];
    const sortedGroups = [...groups.entries()].sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );

    return (
      <div className="space-y-6">
        {sortedGroups.map(([status, items]) => (
          <div key={status}>
            <h2 className="text-xs font-mono uppercase tracking-widest text-cyan mb-3 flex items-center gap-2">
              <span className="h-px flex-1 bg-space-600" />
              <span>
                {statusLabels[status] || status} ({items.length})
              </span>
              <span className="h-px flex-1 bg-space-600" />
            </h2>
            <div className={GRID_CLASS}>
              {items.map((project) => (
                <ProjectTile key={project.slug} project={project} />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={GRID_CLASS}>
      {projects.map((project) => (
        <ProjectTile key={project.slug} project={project} />
      ))}
    </div>
  );
}
