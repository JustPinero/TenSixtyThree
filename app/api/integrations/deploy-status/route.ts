import { NextRequest, NextResponse } from "next/server";
import { getDeploymentStatus } from "@/lib/deploy-monitor";
import { jsonError, requireLocalMode } from "@/lib/access";

export async function GET(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const platform = request.nextUrl.searchParams.get("platform") as
      | "vercel"
      | "railway"
      | null;
    const projectId = request.nextUrl.searchParams.get("projectId");

    if (!platform || !projectId) {
      return NextResponse.json(
        { error: "platform and projectId params required" },
        { status: 400 }
      );
    }

    if (platform !== "vercel" && platform !== "railway") {
      return NextResponse.json(
        { error: "platform must be 'vercel' or 'railway'" },
        { status: 400 }
      );
    }

    const status = await getDeploymentStatus(platform, projectId);
    return NextResponse.json(status);
  } catch (error) {
    return jsonError(error, "integrations.deploy-status");
  }
}
