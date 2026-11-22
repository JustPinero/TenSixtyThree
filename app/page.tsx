/**
 * Phase 60.2 — the dashboard is a server component: it resolves the
 * viewer and loads their visible projects during the server render, then
 * hands them to the client island (chat/SSE, drag, filters live there).
 * No "use client" here — first paint no longer waits on a second request.
 */
import { headers } from "next/headers";
import { loadInitialProjects } from "@/lib/dashboard-data";
import { Dashboard } from "./dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const initialProjects = await loadInitialProjects(await headers());
  return <Dashboard initialProjects={initialProjects} />;
}
