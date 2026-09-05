/**
 * 54.4b — org Linear integration: store the org's Linear API key
 * (sealed) and trigger an import into a chosen org board.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { requireMembership } from "@/lib/orgs";
import { seal, open } from "@/lib/crypto-box";
import { canAccessBoard } from "@/lib/boards";
import { syncLinearIssues, fetchLinearIssues } from "@/lib/linear-sync";

async function orgContext(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) return { error: "Authentication required", status: 401 as const };
  const orgId = session.session.activeOrganizationId;
  if (!orgId) return { error: "No active organization", status: 400 as const };
  const member = await requireMembership(prisma, session.user.id, orgId);
  if (!member) return { error: "Not a member", status: 403 as const };
  return { session, orgId };
}

export async function GET(request: NextRequest) {
  const ctx = await orgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { linearKeyEnc: true },
  });
  return NextResponse.json({ hasKey: Boolean(org?.linearKeyEnc) });
}

export async function PUT(request: NextRequest) {
  const ctx = await orgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith("lin_api_") || key.length < 20 || key.length > 200) {
    return NextResponse.json(
      { error: "That doesn't look like a Linear API key (lin_api_...)" },
      { status: 400 }
    );
  }
  await prisma.organization.update({
    where: { id: ctx.orgId },
    data: { linearKeyEnc: seal(key) },
  });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const ctx = await orgContext(request);
  if ("error" in ctx) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }
  const body = await request.json();
  const boardId = typeof body.boardId === "string" ? body.boardId : "";
  if (!(await canAccessBoard(prisma, ctx.session.user.id, boardId))) {
    return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  const org = await prisma.organization.findUnique({
    where: { id: ctx.orgId },
    select: { linearKeyEnc: true },
  });
  const apiKey = org?.linearKeyEnc ? open(org.linearKeyEnc) : null;
  if (!apiKey) {
    return NextResponse.json(
      { error: "No Linear key stored for this organization" },
      { status: 400 }
    );
  }
  try {
    const result = await syncLinearIssues(prisma, {
      boardId,
      createdById: ctx.session.user.id,
      fetchIssues: () => fetchLinearIssues(apiKey),
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
