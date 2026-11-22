/**
 * Phase 66 — the shared multi-tenant fixture.
 *
 * Every tenant-scoping test asks the same question ("can B see A's
 * rows?"), so the cast lives in one place:
 *
 *   admin  — site admin (the hosted operator)
 *   alice  — owns `alices` (private) and `shared` (shared into alice's org)
 *   bob    — member of alice's org: sees `shared`, never `alices`
 *   carol  — a stranger: owns `carols`, sees nothing of alice's
 *   demo1 / demo2 — two concurrent demo visitors, each with their own
 *            demo org + demo project
 *
 * Plus `operator` (ownerUserId null — the fleet only admins/local see).
 * Each user has a live Better Auth session; `cookie(name)` is the header
 * value that makes a route resolve that user.
 */
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createOrg } from "@/lib/orgs";

export const TENANT_USERS = [
  "admin",
  "alice",
  "bob",
  "carol",
  "demo1",
  "demo2",
] as const;
export type TenantUser = (typeof TENANT_USERS)[number];

export async function seedTenants(prisma: PrismaClient) {
  const expiresAt = new Date(Date.now() + 3600_000);
  for (const id of TENANT_USERS) {
    await prisma.user.create({
      data: {
        id,
        name: id,
        email: `${id}@tenants.test`,
        role: id === "admin" ? "admin" : "user",
        isDemo: id.startsWith("demo"),
      },
    });
    await prisma.session.create({
      data: { token: `tok-${id}`, userId: id, expiresAt },
    });
  }

  const aliceOrg = await createOrg(prisma, {
    name: "Alice Org",
    ownerId: "alice",
  });
  await prisma.member.create({
    data: { userId: "bob", organizationId: aliceOrg.id, role: "member" },
  });
  const demo1Org = await createOrg(prisma, {
    name: "Demo One",
    ownerId: "demo1",
  });
  const demo2Org = await createOrg(prisma, {
    name: "Demo Two",
    ownerId: "demo2",
  });
  await prisma.organization.updateMany({
    where: { id: { in: [demo1Org.id, demo2Org.id] } },
    data: { isDemo: true },
  });

  const mk = (slug: string, extra: Record<string, unknown> = {}) =>
    prisma.project.create({
      data: { name: slug, slug, path: `/p/${slug}`, ...extra },
    });
  const operator = await mk("operator");
  const alices = await mk("alices", { ownerUserId: "alice" });
  const shared = await mk("shared", { ownerUserId: "alice" });
  const carols = await mk("carols", { ownerUserId: "carol" });
  const demo1Proj = await mk("demo1-proj", {
    isDemo: true,
    ownerUserId: "demo1",
  });
  const demo2Proj = await mk("demo2-proj", {
    isDemo: true,
    ownerUserId: "demo2",
  });

  await prisma.orgProjectShare.create({
    data: {
      organizationId: aliceOrg.id,
      projectId: shared.id,
      sharedById: "alice",
    },
  });
  await prisma.orgProjectShare.create({
    data: {
      organizationId: demo1Org.id,
      projectId: demo1Proj.id,
      sharedById: "demo1",
    },
  });
  await prisma.orgProjectShare.create({
    data: {
      organizationId: demo2Org.id,
      projectId: demo2Proj.id,
      sharedById: "demo2",
    },
  });

  return {
    orgs: { aliceOrg, demo1Org, demo2Org },
    projects: { operator, alices, shared, carols, demo1Proj, demo2Proj },
  };
}

export type Tenants = Awaited<ReturnType<typeof seedTenants>>;

export function cookie(user: TenantUser): string {
  return `better-auth.session_token=tok-${user}`;
}

/** A request that resolves to `user` (or anonymous when null). */
export function requestAs(
  user: TenantUser | null,
  url: string,
  init: { method?: string; body?: unknown } = {},
): NextRequest {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (user) headers.cookie = cookie(user);
  return new NextRequest(url, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}
