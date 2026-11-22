/** Phase 66 — one scope object, every tenant-scoped query reads through it. */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";
import {
  scopeForViewer,
  scopeOf,
  DENY_SCOPE,
  activityWhere,
  taskWhere,
  reminderWhere,
  outcomeWhere,
  lessonWhere,
  type ScopeViewer,
} from "./tenant-scope";

let rig: DispatchRig | null = null;
afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  await rig?.dispose();
  rig = null;
});

function viewer(u: TenantUser | "local"): ScopeViewer {
  if (u === "local") return { kind: "local" };
  return {
    kind: "user",
    userId: u,
    isAdmin: u === "admin",
    isDemo: u.startsWith("demo"),
  };
}

/** One activity event, task, reminder, outcome per project + operator rows. */
async function seedRows(r: DispatchRig, t: Tenants) {
  for (const p of Object.values(t.projects)) {
    await r.prisma.activityEvent.create({
      data: { projectId: p.id, eventType: "commit", summary: p.slug },
    });
    await r.prisma.humanTask.create({
      data: { title: p.slug, projectId: p.id, projectSlug: p.slug },
    });
    await r.prisma.dispatchOutcome.create({
      data: {
        projectId: p.id,
        projectSlug: p.slug,
        mode: "continue",
        healthAtDispatch: "healthy",
        outcome: "success",
        dispatchedAt: new Date(),
      },
    });
    await r.prisma.knowledgeLesson.create({
      data: {
        title: p.slug,
        content: "x",
        category: "tooling",
        sourceProjectId: p.id,
      },
    });
  }
  await r.prisma.activityEvent.create({
    data: { eventType: "lesson-harvested", summary: "fleet-wide" },
  });
  await r.prisma.knowledgeLesson.create({
    data: { title: "fleet-lesson", content: "x", category: "tooling" },
  });
  await r.prisma.humanTask.create({ data: { title: "operator-task" } });
  await r.prisma.humanTask.create({
    data: { title: "alice-personal", ownerUserId: "alice" },
  });
  await r.prisma.reminder.create({
    data: {
      message: "operator-rem",
      conditionType: "custom",
      conditionValue: "x",
    },
  });
  await r.prisma.reminder.create({
    data: {
      message: "alice-rem",
      conditionType: "custom",
      conditionValue: "x",
      ownerUserId: "alice",
    },
  });
}

async function setup() {
  rig = await createDispatchRig({ fakeTimers: false });
  const t = await seedTenants(rig.prisma);
  await seedRows(rig, t);
  return { r: rig, t };
}

async function see(r: DispatchRig, u: TenantUser | "local") {
  const scope = await scopeForViewer(r.prisma, viewer(u));
  const [events, tasks, reminders, outcomes, lessons] = await Promise.all([
    r.prisma.activityEvent.findMany({ where: activityWhere(scope) }),
    r.prisma.humanTask.findMany({ where: taskWhere(scope) }),
    r.prisma.reminder.findMany({ where: reminderWhere(scope) }),
    r.prisma.dispatchOutcome.findMany({ where: outcomeWhere(scope) }),
    r.prisma.knowledgeLesson.findMany({ where: lessonWhere(scope) }),
  ]);
  return {
    events: events.map((e) => e.summary).sort(),
    tasks: tasks.map((x) => x.title).sort(),
    reminders: reminders.map((x) => x.message).sort(),
    outcomes: outcomes.map((x) => x.projectSlug).sort(),
    lessons: lessons.map((x) => x.title).sort(),
  };
}

describe("tenant scope", () => {
  it("local operator sees the non-demo fleet and operator rows", async () => {
    const { r } = await setup();
    const v = await see(r, "local");
    expect(v.events).toEqual([
      "alices",
      "carols",
      "fleet-wide",
      "operator",
      "shared",
    ]);
    expect(v.tasks).toEqual([
      "alices",
      "carols",
      "operator",
      "operator-task",
      "shared",
    ]);
    expect(v.reminders).toEqual(["operator-rem"]);
    expect(v.outcomes).toEqual(["alices", "carols", "operator", "shared"]);
    expect(v.lessons).toEqual([
      "alices",
      "carols",
      "fleet-lesson",
      "operator",
      "shared",
    ]);
  });

  it("admin sees what the local operator sees", async () => {
    const { r } = await setup();
    expect(await see(r, "admin")).toEqual(await see(r, "local"));
  });

  it("alice sees her projects, her own rows, nothing fleet-level", async () => {
    const { r } = await setup();
    const v = await see(r, "alice");
    expect(v.events).toEqual(["alices", "shared"]);
    expect(v.tasks).toEqual(["alice-personal", "alices", "shared"]);
    expect(v.reminders).toEqual(["alice-rem"]);
    expect(v.outcomes).toEqual(["alices", "shared"]);
    expect(v.lessons).toEqual(["alices", "shared"]);
  });

  it("bob (alice's org) sees the shared project only — never alice's private rows", async () => {
    const { r } = await setup();
    const v = await see(r, "bob");
    expect(v.events).toEqual(["shared"]);
    expect(v.tasks).toEqual(["shared"]);
    expect(v.reminders).toEqual([]);
    expect(v.outcomes).toEqual(["shared"]);
  });

  it("carol (stranger) sees only her own project", async () => {
    const { r } = await setup();
    const v = await see(r, "carol");
    expect(v.events).toEqual(["carols"]);
    expect(v.tasks).toEqual(["carols"]);
    expect(v.reminders).toEqual([]);
  });

  it("a demo visitor sees only their own demo org's sandbox", async () => {
    const { r } = await setup();
    const v = await see(r, "demo1");
    expect(v.events).toEqual(["demo1-proj"]);
    expect(v.tasks).toEqual(["demo1-proj"]);
    expect(v.outcomes).toEqual(["demo1-proj"]);
    expect(v.reminders).toEqual([]);
    expect(v.lessons).toEqual(["demo1-proj"]);
  });

  it("DENY_SCOPE matches nothing", async () => {
    const { r } = await setup();
    expect(
      await r.prisma.activityEvent.count({ where: activityWhere(DENY_SCOPE) }),
    ).toBe(0);
    expect(
      await r.prisma.humanTask.count({ where: taskWhere(DENY_SCOPE) }),
    ).toBe(0);
    expect(
      await r.prisma.reminder.count({ where: reminderWhere(DENY_SCOPE) }),
    ).toBe(0);
  });
});

describe("scopeOf (tool context default)", () => {
  it("uses the scope on the context when present", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    await seedTenants(rig.prisma);
    const s = await scopeForViewer(rig.prisma, viewer("alice"));
    expect(scopeOf({ scope: s })).toBe(s);
  });

  it("missing scope = local operator in local mode", () => {
    expect(scopeOf({}).isOperator).toBe(true);
    expect(scopeOf({}).userId).toBeNull();
  });

  it("missing scope on the hosted app = deny (never the operator)", () => {
    process.env.AUTH_REQUIRED = "true";
    expect(scopeOf({})).toBe(DENY_SCOPE);
  });
});
