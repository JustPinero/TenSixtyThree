/**
 * Phase 60.2 — the dashboard's server-side first load (kept out of
 * app/page.tsx: Next only allows framework exports from a page module).
 */
import { prisma } from "@/lib/db";
import { viewerFromHeaders, viewerUserId } from "@/lib/access";
import { listVisibleProjects, toDashboardTiles, type DashboardTile } from "@/lib/project-list";

export async function loadInitialProjects(h: Headers): Promise<DashboardTile[] | null> {
  const viewer = await viewerFromHeaders(h);
  if (!viewer) return null;
  try {
    return toDashboardTiles(await listVisibleProjects(prisma, viewerUserId(viewer)));
  } catch (error) {
    // The client island falls back to fetching (and shows its error state).
    console.error("[dashboard] server project load failed", error);
    return null;
  }
}
