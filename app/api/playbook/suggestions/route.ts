import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionLogs } from "@/lib/session-reader";
import { analyzeSessionPatterns } from "@/lib/playbook-learner";
import { jsonError, requireLocalMode } from "@/lib/access";

/**
 * GET /api/playbook/suggestions
 *
 * Analyzes recent session logs across all projects for recurring patterns.
 * Returns playbook addition suggestions when patterns emerge.
 */
export async function GET(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const projects = await prisma.project.findMany({
      where: { status: { in: ["building", "complete"] } },
    });

    // Collect recent session logs from all projects
    const allSessions: Array<{ projectName: string; content: string }> = [];

    for (const project of projects) {
      const logs = await getSessionLogs(project.path, 5);
      for (const log of logs) {
        allSessions.push({
          projectName: project.name,
          content: log.content,
        });
      }
    }

    const suggestions = analyzeSessionPatterns(allSessions);

    return NextResponse.json({
      totalSessionsAnalyzed: allSessions.length,
      projectsAnalyzed: projects.length,
      suggestions,
    });
  } catch (error) {
    return jsonError(error, "playbook.suggestions");
  }
}
