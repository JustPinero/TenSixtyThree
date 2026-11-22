/**
 * Batch review (HIGH) — server-component gate for operator-only pages
 * (/observability/*). Middleware only checks that a session cookie
 * EXISTS, so a page that reads fleet-wide data must resolve the viewer
 * itself. Operator = the local single-user operator, or a non-demo admin
 * (the same rule /api/usage/summary uses).
 */
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { viewerFromHeaders } from "@/lib/access";

export async function isOperatorViewer(h: Headers): Promise<boolean> {
  const viewer = await viewerFromHeaders(h);
  if (!viewer) return false;
  return viewer.kind === "local" || (viewer.isAdmin && !viewer.isDemo);
}

/** Call first in an operator-only page: anyone else gets a 404. */
export async function requireOperatorPage(): Promise<void> {
  if (!(await isOperatorViewer(await headers()))) notFound();
}
