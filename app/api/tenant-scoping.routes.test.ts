/**
 * Phase 66 AC — user B never sees A's chat history, working memory,
 * activity, tasks, reminders, outcomes or attention counts through any
 * route; a demo visitor sees zero non-demo rows and zero rows from
 * another demo org. Real Better Auth sessions (cookie → session row),
 * hosted mode (AUTH_REQUIRED=true).
 */
import { vi, describe, it, expect, afterEach, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const proxy = new Proxy({} as Record<string, unknown>, {
    get(_target, prop) {
      const inj = (globalThis as Record<string, unknown>).__rigPrisma;
      if (!inj) throw new Error("rig prisma not injected");
      return (inj as Record<string, unknown>)[prop as string];
    },
  });
  return { prisma: proxy };
});

import * as history from "./overseer/history/route";
import * as sessionState from "./overseer/session-state/route";
import * as activity from "./activity/route";
import * as tasks from "./tasks/route";
import * as reminders from "./reminders/route";
import * as attention from "./attention/route";
import * as recommendations from "./recommendations/route";
import * as reports from "./reports/generate/route";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  requestAs,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";
import { getOrCreateSession, mergeWorkingMemory } from "@/lib/chat-session";

let rig: DispatchRig | null = null;
let t: Tenants;

beforeEach(async () => {
  process.env.AUTH_REQUIRED = "true";
  rig = await createDispatchRig({ fakeTimers: false });
  (globalThis as Record<string, unknown>).__rigPrisma = rig.prisma;
  t = await seedTenants(rig.prisma);
});

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  delete (globalThis as Record<string, unknown>).__rigPrisma;
  await rig?.dispose();
  rig = null;
});

const DAY = "2026-11-20";

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

describe("66.1 — Overseer history is per user", () => {
  async function post(user: TenantUser, content: string) {
    const res = await history.POST(
      requestAs(user, "http://x/api/overseer/history", {
        method: "POST",
        body: { role: "user", content, sessionDate: DAY },
      }),
    );
    expect(res.status).toBe(201);
  }
  async function list(user: TenantUser): Promise<string[]> {
    const res = await history.GET(
      requestAs(user, `http://x/api/overseer/history?date=${DAY}`),
    );
    expect(res.status).toBe(200);
    return (await json<{ content: string }[]>(res)).map((m) => m.content);
  }

  it("B never sees A's messages", async () => {
    await post("alice", "alice secret");
    await post("bob", "bob hello");
    expect(await list("alice")).toEqual(["alice secret"]);
    expect(await list("bob")).toEqual(["bob hello"]);
    expect(await list("carol")).toEqual([]);
  });

  it("B's DELETE leaves A's history alone", async () => {
    await post("alice", "keep me");
    await post("carol", "drop me");
    const res = await history.DELETE(
      requestAs("carol", `http://x/api/overseer/history?date=${DAY}`, {
        method: "DELETE",
      }),
    );
    expect(res.status).toBe(200);
    expect(await list("alice")).toEqual(["keep me"]);
    expect(await list("carol")).toEqual([]);
  });

  it("anonymous is refused", async () => {
    const res = await history.GET(
      requestAs(null, "http://x/api/overseer/history"),
    );
    expect(res.status).toBe(401);
  });
});

describe("66.1 — working memory is per user", () => {
  it("B's session-state never returns A's working memory", async () => {
    const aSession = await getOrCreateSession(rig!.prisma, DAY, "alice");
    await mergeWorkingMemory(rig!.prisma, aSession.id, {
      secret: "alice-plan",
    });

    const asBob = await sessionState.GET(
      requestAs(
        "bob",
        `http://x/api/overseer/session-state?sessionDate=${DAY}`,
      ),
    );
    expect(await json<{ exists: boolean }>(asBob)).toMatchObject({
      exists: false,
    });

    const asAlice = await sessionState.GET(
      requestAs(
        "alice",
        `http://x/api/overseer/session-state?sessionDate=${DAY}`,
      ),
    );
    expect(await json<{ workingMemory: unknown }>(asAlice)).toMatchObject({
      workingMemory: { secret: "alice-plan" },
    });
  });

  it("two users on the same day get two sessions", async () => {
    const a = await getOrCreateSession(rig!.prisma, DAY, "alice");
    const b = await getOrCreateSession(rig!.prisma, DAY, "bob");
    expect(a.id).not.toBe(b.id);
    expect(await getOrCreateSession(rig!.prisma, DAY, "alice")).toMatchObject({
      id: a.id,
    });
  });
});

describe("66.2 — dashboard routes through the visibility matrix", () => {
  async function seedRows() {
    const p = rig!.prisma;
    for (const proj of Object.values(t.projects)) {
      await p.activityEvent.create({
        data: { projectId: proj.id, eventType: "commit", summary: proj.slug },
      });
      await p.humanTask.create({
        data: { title: proj.slug, projectId: proj.id, projectSlug: proj.slug },
      });
      await p.dispatchOutcome.create({
        data: {
          projectId: proj.id,
          projectSlug: proj.slug,
          mode: "continue",
          healthAtDispatch: "healthy",
          outcome: "blocker",
          signals: "[]",
          dispatchedAt: new Date(),
        },
      });
    }
    await p.project.updateMany({ data: { health: "blocked" } });
    await p.activityEvent.create({
      data: { eventType: "lesson-harvested", summary: "fleet" },
    });
    await p.reminder.create({
      data: {
        message: "alice-rem",
        conditionType: "custom",
        conditionValue: "x",
        ownerUserId: "alice",
      },
    });
    await p.reminder.create({
      data: {
        message: "operator-rem",
        conditionType: "custom",
        conditionValue: "x",
      },
    });
  }

  async function activitySummaries(user: TenantUser) {
    const res = await activity.GET(
      requestAs(user, "http://x/api/activity?limit=100"),
    );
    expect(res.status).toBe(200);
    return (await json<{ summary: string }[]>(res))
      .map((e) => e.summary)
      .sort();
  }
  async function taskTitles(user: TenantUser) {
    const res = await tasks.GET(requestAs(user, "http://x/api/tasks"));
    expect(res.status).toBe(200);
    return (await json<{ title: string }[]>(res)).map((x) => x.title).sort();
  }
  async function reminderMessages(user: TenantUser) {
    const res = await reminders.GET(requestAs(user, "http://x/api/reminders"));
    expect(res.status).toBe(200);
    return (await json<{ message: string }[]>(res))
      .map((x) => x.message)
      .sort();
  }
  async function attentionOf(user: TenantUser) {
    const res = await attention.GET(requestAs(user, "http://x/api/attention"));
    return json<{
      breakdown: { pendingTasks: number; blockedProjects: number };
    }>(res);
  }
  async function recommendedSlugs(user: TenantUser) {
    const res = await recommendations.GET(
      requestAs(user, "http://x/api/recommendations"),
    );
    const body = await json<{ recommendations: { slug: string }[] }>(res);
    return [...new Set(body.recommendations.map((r) => r.slug))].sort();
  }

  it("activity: bob sees the shared project only; admin sees the fleet", async () => {
    await seedRows();
    expect(await activitySummaries("bob")).toEqual(["shared"]);
    expect(await activitySummaries("alice")).toEqual(["alices", "shared"]);
    expect(await activitySummaries("admin")).toEqual([
      "alices",
      "carols",
      "fleet",
      "operator",
      "shared",
    ]);
  });

  it("tasks, reminders, attention and recommendations are scoped", async () => {
    await seedRows();
    expect(await taskTitles("carol")).toEqual(["carols"]);
    expect(await reminderMessages("alice")).toEqual(["alice-rem"]);
    expect(await reminderMessages("bob")).toEqual([]);
    expect((await attentionOf("bob")).breakdown).toEqual({
      pendingTasks: 1,
      blockedProjects: 1,
    });
    for (const slug of await recommendedSlugs("bob"))
      expect(slug).toBe("shared");
  });

  it("demo visitor: zero non-demo rows, zero rows from another demo org", async () => {
    await seedRows();
    expect(await activitySummaries("demo1")).toEqual(["demo1-proj"]);
    expect(await taskTitles("demo1")).toEqual(["demo1-proj"]);
    expect(await reminderMessages("demo1")).toEqual([]);
    expect((await attentionOf("demo1")).breakdown).toEqual({
      pendingTasks: 1,
      blockedProjects: 1,
    });
    for (const slug of await recommendedSlugs("demo1"))
      expect(slug).toBe("demo1-proj");
  });

  it("B cannot change, delete, or attach to A's tasks", async () => {
    const p = rig!.prisma;
    const aTask = await p.humanTask.create({
      data: {
        title: "a",
        projectId: t.projects.alices.id,
        projectSlug: "alices",
      },
    });
    const patch = await tasks.PATCH(
      requestAs("carol", "http://x/api/tasks", {
        method: "PATCH",
        body: { id: aTask.id, status: "done" },
      }),
    );
    expect(patch.status).toBe(404);
    const del = await tasks.DELETE(
      requestAs("carol", "http://x/api/tasks", {
        method: "DELETE",
        body: { id: aTask.id },
      }),
    );
    expect(del.status).toBe(404);
    expect(
      await p.humanTask.findUnique({ where: { id: aTask.id } }),
    ).toMatchObject({
      status: "pending",
    });
    const attach = await tasks.POST(
      requestAs("carol", "http://x/api/tasks", {
        method: "POST",
        body: { title: "sneaky", projectSlug: "alices" },
      }),
    );
    expect(attach.status).toBe(404);
  });

  it("a created task or reminder belongs to its creator", async () => {
    const res = await tasks.POST(
      requestAs("carol", "http://x/api/tasks", {
        method: "POST",
        body: { title: "mine" },
      }),
    );
    expect(res.status).toBe(201);
    expect(await json<{ ownerUserId: string }>(res)).toMatchObject({
      ownerUserId: "carol",
    });
    expect(await taskTitles("carol")).toEqual(["mine"]);
    expect(await taskTitles("bob")).toEqual([]);

    const rem = await reminders.POST(
      requestAs("carol", "http://x/api/reminders", {
        method: "POST",
        body: { message: "m", conditionType: "custom", conditionValue: "v" },
      }),
    );
    expect(rem.status).toBe(201);
    const created = await json<{ id: number; ownerUserId: string }>(rem);
    expect(created.ownerUserId).toBe("carol");

    const bobPatch = await reminders.PATCH(
      requestAs("bob", "http://x/api/reminders", {
        method: "PATCH",
        body: { id: created.id, status: "dismissed" },
      }),
    );
    expect(bobPatch.status).toBe(404);
  });

  it("reminders cannot watch a project the creator cannot see (no state oracle)", async () => {
    const sneaky = await reminders.POST(
      requestAs("carol", "http://x/api/reminders", {
        method: "POST",
        body: { message: "m", conditionType: "project-health", conditionValue: "alices:healthy" },
      }),
    );
    expect(sneaky.status).toBe(404);
    const viaSlug = await reminders.POST(
      requestAs("carol", "http://x/api/reminders", {
        method: "POST",
        body: { message: "m", conditionType: "custom", conditionValue: "v", projectSlug: "alices" },
      }),
    );
    expect(viaSlug.status).toBe(404);

    // A row that slipped in anyway (legacy / direct write) never fires
    // on another tenant's project state.
    const p = rig!.prisma;
    const planted = await p.reminder.create({
      data: {
        message: "planted",
        conditionType: "project-deployed",
        conditionValue: "alices",
        ownerUserId: "carol",
      },
    });
    await p.project.update({ where: { slug: "alices" }, data: { status: "deployed" } });
    await reminders.GET(requestAs("carol", "http://x/api/reminders"));
    expect(await p.reminder.findUniqueOrThrow({ where: { id: planted.id } })).toMatchObject({
      status: "pending",
    });

    // ...while the owner's own reminder on the same project does fire.
    const own = await p.reminder.create({
      data: {
        message: "own",
        conditionType: "project-deployed",
        conditionValue: "alices",
        ownerUserId: "alice",
      },
    });
    await reminders.GET(requestAs("alice", "http://x/api/reminders"));
    expect(await p.reminder.findUniqueOrThrow({ where: { id: own.id } })).toMatchObject({
      status: "triggered",
    });
  });
});

describe("66.2 — reports go through the visibility matrix", () => {
  const gen = (u: TenantUser, body: Record<string, unknown>) =>
    reports.POST(requestAs(u, "http://x/api/reports/generate", { method: "POST", body }));

  it("a single-project report on someone else's project is a 404", async () => {
    expect((await gen("carol", { type: "single", slug: "alices" })).status).toBe(404);
    expect((await gen("alice", { type: "single", slug: "alices" })).status).toBe(200);
  });

  it("the cross-project report covers only visible projects", async () => {
    for (const proj of Object.values(t.projects)) {
      await rig!.prisma.activityEvent.create({
        data: { projectId: proj.id, eventType: "commit", summary: `evt-${proj.slug}` },
      });
    }
    const res = await gen("bob", { type: "cross-project" });
    expect(res.status).toBe(200);
    const text = JSON.stringify(await res.json());
    expect(text).toContain("shared");
    for (const hidden of ["alices", "carols", "operator", "demo1-proj", "demo2-proj"]) {
      expect(text).not.toContain(hidden);
    }
  });
});

