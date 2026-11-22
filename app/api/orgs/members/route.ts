/**
 * Phase 68.4 — the active org's members and pending invitations.
 *
 * GET: any member. PATCH (role) and DELETE (remove): org owner/admin.
 * Rules: admins can't touch owners; the last owner can't be demoted or
 * removed; ids from other orgs are 404 (no cross-org oracle).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { activeOrgContext } from "@/lib/org-context";
import { requireSignedIn } from "@/lib/access";

const ROLES = ["owner", "admin", "member"];

async function context(request: NextRequest) {
  const ctx = await activeOrgContext(prisma, request, { allowDemo: false });
  if (!ctx.ok) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: ctx.error }, { status: ctx.status }),
    };
  }
  const me = await prisma.member.findFirst({
    where: { organizationId: ctx.orgId, userId: ctx.session.user.id },
    select: { role: true },
  });
  return { ok: true as const, ctx, myRole: me?.role ?? "member" };
}

const canManage = (role: string) => role === "owner" || role === "admin";

async function ownerCount(orgId: string) {
  return prisma.member.count({
    where: { organizationId: orgId, role: "owner" },
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const c = await context(request);
  if (!c.ok) return c.response;
  const [rows, invitations] = await Promise.all([
    prisma.member.findMany({
      where: { organizationId: c.ctx.orgId },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.invitation.findMany({
      where: {
        organizationId: c.ctx.orgId,
        status: "pending",
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { id: true, email: true, role: true, expiresAt: true },
    }),
  ]);
  return NextResponse.json({
    members: rows.map((m) => ({
      id: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })),
    invitations,
    canManage: canManage(c.myRole),
    myRole: c.myRole,
  });
}

async function target(orgId: string, memberId: unknown) {
  if (typeof memberId !== "string") return null;
  return prisma.member.findFirst({
    where: { id: memberId, organizationId: orgId },
    select: { id: true, role: true },
  });
}

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const c = await context(request);
  if (!c.ok) return c.response;
  if (!canManage(c.myRole)) {
    return NextResponse.json(
      { error: "Only an owner or admin can change roles" },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const role =
    typeof body.role === "string" && ROLES.includes(body.role)
      ? body.role
      : null;
  if (!role)
    return NextResponse.json({ error: "Unknown role" }, { status: 400 });
  const row = await target(c.ctx.orgId, body.memberId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Only owners touch owners (or make new ones).
  if ((row.role === "owner" || role === "owner") && c.myRole !== "owner") {
    return NextResponse.json(
      { error: "Only an owner can change an owner" },
      { status: 403 },
    );
  }
  if (
    row.role === "owner" &&
    role !== "owner" &&
    (await ownerCount(c.ctx.orgId)) <= 1
  ) {
    return NextResponse.json(
      { error: "An organization needs at least one owner" },
      { status: 409 },
    );
  }
  await prisma.member.update({ where: { id: row.id }, data: { role } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const access = await requireSignedIn(request, { allowDemo: false });
  if (!access.ok) return access.response;
  const c = await context(request);
  if (!c.ok) return c.response;
  if (!canManage(c.myRole)) {
    return NextResponse.json(
      { error: "Only an owner or admin can remove members" },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => ({}));
  const row = await target(c.ctx.orgId, body.memberId);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (row.role === "owner" && c.myRole !== "owner") {
    return NextResponse.json(
      { error: "Only an owner can remove an owner" },
      { status: 403 },
    );
  }
  if (row.role === "owner" && (await ownerCount(c.ctx.orgId)) <= 1) {
    return NextResponse.json(
      { error: "An organization needs at least one owner" },
      { status: 409 },
    );
  }
  await prisma.member.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
}
