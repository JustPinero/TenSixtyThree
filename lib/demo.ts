/**
 * 54.5 — the demo sandbox.
 *
 * "Try the demo" mints an ephemeral demo user + demo org seeded with
 * representative content, so every feature has something to show. Demo
 * identities are flagged (isDemo) and swept after 24h. Side effects are
 * blocked at the choke points (chat → canned, dispatch/admin/BYOK →
 * refused) — see isDemoSession call sites.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createOrg } from "./orgs";
import { createBoard, positionAfter } from "./boards";
import type { ServerSession } from "./auth-helpers";

const DEMO_DOMAIN = "demo.tensixtythree.local";
const SESSION_TTL_MS = 2 * 3600_000;
const SWEEP_AGE_MS = 24 * 3600_000;

export function isDemoEmail(email: string): boolean {
  return email.endsWith(`@${DEMO_DOMAIN}`);
}

export function isDemoSession(session: ServerSession | null): boolean {
  return session !== null && isDemoEmail(session.user.email);
}

export interface DemoIdentity {
  userId: string;
  organizationId: string;
  sessionToken: string;
}

export async function seedDemo(prisma: PrismaClient): Promise<DemoIdentity> {
  const tag = randomBytes(6).toString("hex");
  const user = await prisma.user.create({
    data: {
      name: "Demo Explorer",
      email: `demo-${tag}@${DEMO_DOMAIN}`,
      emailVerified: true,
      isDemo: true,
    },
  });
  const org = await createOrg(prisma, {
    name: `Demo Fleet ${tag.slice(0, 4)}`,
    ownerId: user.id,
  });
  await prisma.organization.update({
    where: { id: org.id },
    data: { isDemo: true },
  });

  // Representative fleet — flagged so real dashboards can filter them.
  const projects = await Promise.all(
    [
      {
        name: "Atlas API",
        slug: `demo-atlas-${tag}`,
        health: "healthy",
        progressScore: 72,
        currentPhase: "phase-4-integrations",
      },
      {
        name: "Meridian Web",
        slug: `demo-meridian-${tag}`,
        health: "warning",
        progressScore: 41,
        currentPhase: "phase-2-dashboard",
      },
    ].map((p) =>
      prisma.project.create({
        data: { ...p, path: `/demo/${p.slug}`, isDemo: true },
      }),
    ),
  );
  await prisma.orgProjectShare.createMany({
    data: projects.map((p) => ({
      organizationId: org.id,
      projectId: p.id,
      sharedById: user.id,
    })),
  });

  const board = await createBoard(prisma, {
    name: "Sprint Board",
    organizationId: org.id,
  });
  const columns = await prisma.boardColumn.findMany({
    where: { boardId: board.id },
    orderBy: { position: "asc" },
  });
  const ticketSeeds: [number, string, string][] = [
    [0, "Wire health-check alerts", "high"],
    [0, "Draft onboarding copy", "normal"],
    [1, "Harden webhook retry tests", "urgent"],
    [2, "Ship dark-mode palette", "normal"],
  ];
  let position = 0;
  for (const [col, title, priority] of ticketSeeds) {
    position = positionAfter(position);
    await prisma.ticket.create({
      data: {
        boardId: board.id,
        columnId: columns[col].id,
        title,
        priority,
        position,
        createdById: user.id,
      },
    });
  }

  await prisma.milestone.createMany({
    data: [
      {
        organizationId: org.id,
        title: "Public beta",
        status: "in_progress",
        position: 1024,
      },
      {
        organizationId: org.id,
        title: "v1 launch",
        status: "planned",
        position: 2048,
      },
    ],
  });

  await prisma.orgPost.createMany({
    data: [
      {
        organizationId: org.id,
        authorUserId: user.id,
        type: "goal",
        title: "Ship the beta by end of quarter",
        body: "Focus: stability over features.",
      },
      {
        organizationId: org.id,
        authorUserId: user.id,
        type: "bug",
        title: "Atlas API drops long-running streams",
        body: "Repro: responses over 60s close early.",
        projectId: projects[0].id,
      },
      {
        organizationId: org.id,
        authorUserId: user.id,
        type: "test-request",
        title: "Harden the webhook suite",
        body: "Edge cases around replay + duplicate deliveries.",
      },
    ],
  });

  const sessionToken = `demo-${randomBytes(24).toString("hex")}`;
  await prisma.session.create({
    data: {
      id: `demo-s-${tag}`,
      token: sessionToken,
      userId: user.id,
      activeOrganizationId: org.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });

  return { userId: user.id, organizationId: org.id, sessionToken };
}

export async function cleanupDemo(
  prisma: PrismaClient,
): Promise<{ users: number }> {
  const cutoff = new Date(Date.now() - SWEEP_AGE_MS);
  const stale = await prisma.user.findMany({
    where: { isDemo: true, createdAt: { lt: cutoff } },
    select: { id: true },
  });
  if (stale.length === 0) return { users: 0 };
  const ids = stale.map((u) => u.id);

  const orgs = await prisma.organization.findMany({
    where: { isDemo: true, members: { some: { userId: { in: ids } } } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);

  // Orders matter only where cascades don't cover (posts/shares/boards
  // cascade from Organization; sessions/members cascade from User).
  await prisma.board.deleteMany({
    where: {
      OR: [{ organizationId: { in: orgIds } }, { ownerUserId: { in: ids } }],
    },
  });
  await prisma.milestone.deleteMany({
    where: {
      OR: [{ organizationId: { in: orgIds } }, { ownerUserId: { in: ids } }],
    },
  });
  await prisma.orgPost.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  const demoProjects = await prisma.project.findMany({
    where: {
      isDemo: true,
      orgShares: { some: { organizationId: { in: orgIds } } },
    },
    select: { id: true },
  });
  await prisma.orgProjectShare.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.project.deleteMany({
    where: { id: { in: demoProjects.map((p) => p.id) } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  return { users: ids.length };
}
