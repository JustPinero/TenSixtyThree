import { NextRequest, NextResponse } from "next/server";
import { createGitHubRepo, isGhAuthenticated } from "@/lib/github";
import { jsonError, requireLocalMode } from "@/lib/access";

export async function POST(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    if (!isGhAuthenticated()) {
      return NextResponse.json(
        { error: "GitHub CLI not authenticated. Run `gh auth login` first." },
        { status: 401 }
      );
    }

    const { name, isPrivate, description } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "Repository name is required" },
        { status: 400 }
      );
    }

    const result = createGitHubRepo({
      name,
      isPrivate: isPrivate ?? true,
      description,
    });

    if (result.success) {
      return NextResponse.json({ url: result.url }, { status: 201 });
    } else {
      return NextResponse.json(
        { error: result.error },
        { status: 409 }
      );
    }
  } catch (error) {
    return jsonError(error, "integrations.github");
  }
}
