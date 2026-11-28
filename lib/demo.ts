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
import type { PrismaClient, Prisma } from "@/app/generated/prisma/client";
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
  // Bughunt 1.0: the persisted User.isDemo flag is the source of truth;
  // the email suffix stays only as belt-and-braces for legacy rows.
  return (
    session !== null && (session.user.isDemo || isDemoEmail(session.user.email))
  );
}

export interface DemoIdentity {
  userId: string;
  organizationId: string;
  sessionToken: string;
}

export async function seedDemo(client: PrismaClient): Promise<DemoIdentity> {
  // Phase 70 — one transaction: a failure part-way never leaves a
  // half-seeded sandbox (user with no org, org with no projects).
  return client.$transaction((prisma) => seedDemoIn(prisma), { timeout: 15_000 });
}

async function seedDemoIn(prisma: Prisma.TransactionClient): Promise<DemoIdentity> {
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
    // 75 — the slug keeps the tag (unique without a scan); the name shown
    // to the visitor doesn't.
    data: { isDemo: true, name: "Demo Fleet" },
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
      // 76 — a blocked project, so "what needs attention" has an answer.
      {
        name: "Beacon Mobile",
        slug: `demo-beacon-${tag}`,
        health: "blocked",
        progressScore: 18,
        currentPhase: "phase-1-foundation",
      },
    ].map((p) =>
      prisma.project.create({
        data: {
          ...p,
          path: `/demo/${p.slug}`,
          isDemo: true,
          // 76 — sample repo names (never cloned: demo dispatch is refused).
          githubRepo: `demo-fleet/${p.name.toLowerCase().replace(/\s+/g, "-")}`,
          autonomyMode: "full",
        },
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

  await seedDemoHistory(prisma, {
    atlas: projects[0],
    meridian: projects[1],
    beacon: projects[2],
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

type DemoProject = { id: number; slug: string; name: string };

/**
 * 76 — the history that makes the sandbox look lived-in: activity over the
 * last few days, open human tasks, audit grades, and one finished cloud run
 * on Atlas (completed Dispatch + outcome + progress events). Every row
 * hangs off a demo project, so the project cascade in cleanupDemo sweeps
 * it. Facts match the scripted assistant (lib/demo-overseer.ts).
 */
async function seedDemoHistory(
  prisma: Prisma.TransactionClient,
  p: { atlas: DemoProject; meridian: DemoProject; beacon: DemoProject },
): Promise<void> {
  const now = Date.now();
  const ago = (hours: number) => new Date(now - hours * 3600_000);

  const run = await prisma.dispatch.create({
    data: {
      projectId: p.atlas.id,
      projectSlug: p.atlas.slug,
      mode: "custom",
      runtime: "cloud",
      status: "completed",
      healthAtDispatch: "healthy",
      enqueuedAt: ago(14),
      startedAt: ago(14),
      completedAt: ago(13.5),
      costUsd: 0.38,
      attempts: 1,
      resultBranch: "cloud/demo-atlas-retry",
    },
  });
  await prisma.dispatchOutcome.create({
    data: {
      projectId: p.atlas.id,
      projectSlug: p.atlas.slug,
      dispatchId: run.id,
      mode: "custom",
      healthAtDispatch: "healthy",
      outcome: "success",
      dispatchedAt: ago(14),
      completedAt: ago(13.5),
      costUsd: 0.38,
      turns: 14,
    },
  });

  const progress = [
    "Cloned demo-fleet/atlas-api into the sandbox",
    "Read the webhook client and its tests",
    "Added retry with exponential backoff (3 attempts, jittered)",
    "Tests pass: 128 of 128",
    "Pushed cloud/demo-atlas-retry",
  ];
  const events: Prisma.ActivityEventCreateManyInput[] = progress.map(
    (summary, i) => ({
      projectId: p.atlas.id,
      eventType: "cloud-progress",
      summary,
      dispatchId: run.id,
      createdAt: new Date(ago(14).getTime() + (i + 1) * 5 * 60_000),
    }),
  );
  events.push(
    {
      projectId: p.atlas.id,
      eventType: "session-complete",
      summary: "Cloud run finished: retry-with-backoff for the webhook client",
      createdAt: ago(13.5),
    },
    {
      projectId: p.atlas.id,
      eventType: "audit-complete",
      summary: "Test audit: grade A-",
      createdAt: ago(30),
    },
    {
      projectId: p.meridian.id,
      eventType: "session-complete",
      summary: "Session ended with 3 failing tests in the checkout flow",
      createdAt: ago(6),
    },
    {
      projectId: p.meridian.id,
      eventType: "audit-complete",
      summary: "Test audit: grade C — cart edge cases uncovered",
      createdAt: ago(26),
    },
    {
      projectId: p.meridian.id,
      eventType: "phase-complete",
      summary: "Phase 1 (foundation) complete",
      createdAt: ago(72),
    },
    {
      projectId: p.beacon.id,
      eventType: "blocker-detected",
      summary: "Blocked: needs App Store Connect credentials",
      createdAt: ago(3),
    },
    {
      projectId: p.beacon.id,
      eventType: "project-created",
      summary: "Project created from the mobile-app template",
      createdAt: ago(96),
    },
  );
  await prisma.activityEvent.createMany({ data: events });

  await prisma.humanTask.createMany({
    data: [
      {
        title: "Add App Store Connect credentials for TestFlight builds",
        category: "credential",
        priority: "high",
        projectId: p.beacon.id,
        projectSlug: p.beacon.slug,
        createdBy: "claude",
        createdAt: ago(3),
      },
      {
        title: "Review the retry-with-backoff branch",
        category: "review",
        priority: "normal",
        projectId: p.atlas.id,
        projectSlug: p.atlas.slug,
        createdBy: "claude",
        createdAt: ago(13),
      },
      {
        title: "Try the checkout flow on a phone before the fix lands",
        category: "testing",
        priority: "normal",
        projectId: p.meridian.id,
        projectSlug: p.meridian.slug,
        createdBy: "claude",
        createdAt: ago(5),
      },
      {
        title: "Upload the app icon set (1024px master)",
        category: "asset",
        priority: "low",
        projectId: p.beacon.id,
        projectSlug: p.beacon.slug,
        createdBy: "claude",
        createdAt: ago(50),
      },
    ],
  });

  await prisma.auditSnapshot.createMany({
    data: [
      {
        projectId: p.atlas.id,
        phase: "phase-4-integrations",
        auditType: "test-audit",
        grade: "A-",
        findings: JSON.stringify({ summary: "Integration tests are slow (40s)." }),
        capturedAt: ago(30),
      },
      {
        projectId: p.atlas.id,
        phase: "phase-4-integrations",
        auditType: "bughunt",
        grade: "B+",
        findings: JSON.stringify({ summary: "Streams over 60s close early." }),
        capturedAt: ago(30),
      },
      {
        projectId: p.meridian.id,
        phase: "phase-2-dashboard",
        auditType: "test-audit",
        grade: "C",
        findings: JSON.stringify({ summary: "Cart edge cases have no coverage." }),
        capturedAt: ago(26),
      },
    ],
  });
  await prisma.project.update({
    where: { id: p.atlas.id },
    data: { lastActivityAt: ago(13.5) },
  });
  await prisma.project.update({
    where: { id: p.meridian.id },
    data: { lastActivityAt: ago(6) },
  });
  await prisma.project.update({
    where: { id: p.beacon.id },
    data: { lastActivityAt: ago(3) },
  });
}

export async function cleanupDemo(
  prisma: PrismaClient,
): Promise<{ users: number }> {
  const cutoff = new Date(Date.now() - SWEEP_AGE_MS);
  // Phase 70 — demo projects also go by age: a project whose share row was
  // lost (or a half-seeded one from before the seed was transactional)
  // used to live forever. Project children cascade.
  await prisma.project.deleteMany({
    where: { isDemo: true, createdAt: { lt: cutoff } },
  });
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

  // Posts and shares cascade from Organization; sessions and members from
  // User. Board and Milestone do NOT — they carry a bare organizationId with
  // no FK (app-level ownership), so they must be deleted explicitly here.
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
