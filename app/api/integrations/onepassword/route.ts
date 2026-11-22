import { NextRequest, NextResponse } from "next/server";
import {
  isOpAuthenticated,
  readExpectedVars,
  checkVaultItem,
  createVaultItem,
  populateEnvLocal,
} from "@/lib/onepassword";
import { isInsideProjectsDir } from "@/lib/validators";
import { jsonError, requireLocalMode } from "@/lib/access";
import { prisma } from "@/lib/db";
import path from "path";

const VAULT_NAME = "Cascade";

/**
 * Phase 70 — only a registered, non-demo project's directory may be read
 * or written (populate writes .env.local there). A path the request
 * merely names is not enough.
 */
async function isRegisteredProject(projectPath: unknown): Promise<boolean> {
  if (typeof projectPath !== "string" || !projectPath) return false;
  const hit = await prisma.project.findFirst({
    where: { path: path.resolve(projectPath), isDemo: false },
    select: { id: true },
  });
  return hit !== null;
}

export async function GET(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const projectPath = request.nextUrl.searchParams.get("path");
    const projectName = request.nextUrl.searchParams.get("name");

    if (!projectPath || !projectName) {
      return NextResponse.json(
        { error: "path and name params required" },
        { status: 400 }
      );
    }

    if (!isInsideProjectsDir(projectPath) || !(await isRegisteredProject(projectPath))) {
      return NextResponse.json(
        { error: "Invalid project path" },
        { status: 403 }
      );
    }

    if (!isOpAuthenticated()) {
      return NextResponse.json(
        { error: "1Password CLI not authenticated", authenticated: false },
        { status: 401 }
      );
    }

    const expectedVars = await readExpectedVars(projectPath);
    const status = checkVaultItem(VAULT_NAME, projectName, expectedVars);

    return NextResponse.json({ authenticated: true, vars: status });
  } catch (error) {
    return jsonError(error, "integrations.onepassword");
  }
}

export async function POST(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const body = await request.json();
    const { action, projectPath, projectName, vars } = body;

    if (!isOpAuthenticated()) {
      return NextResponse.json(
        { error: "1Password CLI not authenticated" },
        { status: 401 }
      );
    }

    if (action === "create") {
      const result = createVaultItem(
        VAULT_NAME,
        projectName,
        vars || {}
      );
      return NextResponse.json(result);
    }

    if (action === "populate") {
      if (!(await isRegisteredProject(projectPath))) {
        return NextResponse.json({ error: "Invalid project path" }, { status: 403 });
      }
      const expectedVars = await readExpectedVars(projectPath);
      const result = await populateEnvLocal(
        projectPath,
        VAULT_NAME,
        projectName,
        expectedVars
      );
      return NextResponse.json(result);
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'create' or 'populate'" },
      { status: 400 }
    );
  } catch (error) {
    return jsonError(error, "integrations.onepassword");
  }
}
