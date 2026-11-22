/**
 * Phase 66.1 AC — through any Overseer tool, user B never sees A's
 * projects, activity, outcomes, lessons or chat; mutating tools record
 * the acting user; operator-only tools return nothing to non-operators.
 */
import { describe, it, expect, afterEach } from "vitest";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import {
  seedTenants,
  type Tenants,
  type TenantUser,
} from "@/tests/harness/tenants";
import { buildDefaultRegistry } from "./overseer-tools-registry-default";
import type { ToolContext, ToolExecutionResult } from "./overseer-tools";
import { scopeForViewer } from "./tenant-scope";
import { getOrCreateSession } from "./chat-session";

let rig: DispatchRig | null = null;
let t: Tenants;
const registry = buildDefaultRegistry();

afterEach(async () => {
  delete process.env.AUTH_REQUIRED;
  await rig?.dispose();
  rig = null;
});

async function setup() {
  rig = await createDispatchRig({ fakeTimers: false });
  t = await seedTenants(rig.prisma);
  for (const p of Object.values(t.projects)) {
    await rig.prisma.activityEvent.create({
      data: { projectId: p.id, eventType: "commit", summary: p.slug },
    });
    await rig.prisma.dispatchOutcome.create({
      data: {
        projectId: p.id,
        projectSlug: p.slug,
        mode: "continue",
        healthAtDispatch: "healthy",
        outcome: "success",
        dispatchedAt: new Date(),
      },
    });
  }
  return rig;
}

async function ctxFor(r: DispatchRig, u: TenantUser): Promise<ToolContext> {
  const scope = await scopeForViewer(r.prisma, {
    kind: "user",
    userId: u,
    isAdmin: u === "admin",
    isDemo: u.startsWith("demo"),
  });
  const session = await getOrCreateSession(r.prisma, "2026-11-20", u);
  return { prisma: r.prisma, sessionId: session.id, scope };
}

function ok(res: ToolExecutionResult): Record<string, unknown> {
  if (!res.ok) throw new Error(`tool failed: ${res.error}`);
  return res.output as Record<string, unknown>;
}

describe("Overseer tools are tenant-scoped", () => {
  it("query_projects lists only visible projects", async () => {
    const r = await setup();
    const out = ok(
      await registry.execute(
        "query_projects",
        { includeBackburner: true },
        await ctxFor(r, "bob"),
      ),
    );
    const slugs = (out.projects as { slug: string }[]).map((p) => p.slug);
    expect(slugs).toEqual(["shared"]);
  });

  it("query_project and get_session_logs treat an invisible project as missing", async () => {
    const r = await setup();
    const ctx = await ctxFor(r, "carol");
    expect(
      ok(await registry.execute("query_project", { slug: "alices" }, ctx)),
    ).toMatchObject({
      found: false,
    });
    expect(
      ok(await registry.execute("get_session_logs", { slug: "alices" }, ctx)),
    ).toMatchObject({
      found: false,
    });
  });

  it("get_recent_activity and get_dispatch_outcomes are filtered", async () => {
    const r = await setup();
    const ctx = await ctxFor(r, "bob");
    const act = ok(
      await registry.execute("get_recent_activity", { limit: 50 }, ctx),
    );
    const summaries = (act.events as { summary: string }[]).map(
      (e) => e.summary,
    );
    expect(summaries).toEqual(["shared"]);
    const outc = ok(await registry.execute("get_dispatch_outcomes", {}, ctx));
    // One seeded outcome per project; bob can see exactly one (shared).
    expect(outc.totalSampled).toBe(1);
  });

  it("query_outcome_history returns nothing for another user's project", async () => {
    const r = await setup();
    const out = ok(
      await registry.execute(
        "query_outcome_history",
        { slug: "alices" },
        await ctxFor(r, "carol"),
      ),
    );
    expect(out).toMatchObject({ totalDispatches: 0 });
  });

  it("propose_dispatch refuses a slug the user cannot see", async () => {
    const r = await setup();
    const res = await registry.execute(
      "propose_dispatch",
      { slug: "alices", mode: "continue", reason: "x" },
      await ctxFor(r, "carol"),
    );
    expect(res.ok).toBe(false);
  });

  it("create_human_todo records the acting user and refuses invisible projects", async () => {
    const r = await setup();
    const ctx = await ctxFor(r, "carol");
    const made = ok(
      await registry.execute(
        "create_human_todo",
        { title: "do it", category: "other" },
        ctx,
      ),
    );
    const row = await r.prisma.humanTask.findUniqueOrThrow({
      where: { id: Number(made.id) },
    });
    expect(row.ownerUserId).toBe("carol");
    const sneaky = await registry.execute(
      "create_human_todo",
      { title: "x", category: "other", projectSlug: "alices" },
      ctx,
    );
    expect(sneaky.ok).toBe(false);
  });

  it("create_reminder refuses a condition on an invisible project", async () => {
    const r = await setup();
    const res = await registry.execute(
      "create_reminder",
      { message: "m", conditionType: "project-health", conditionValue: "alices:healthy" },
      await ctxFor(r, "carol"),
    );
    expect(res.ok).toBe(false);
  });

  it("create_reminder records the acting user", async () => {
    const r = await setup();
    const made = ok(
      await registry.execute(
        "create_reminder",
        { message: "m", conditionType: "custom", conditionValue: "v" },
        await ctxFor(r, "carol"),
      ),
    );
    const row = await r.prisma.reminder.findUniqueOrThrow({
      where: { id: Number(made.id) },
    });
    expect(row.ownerUserId).toBe("carol");
  });

  it("get_yesterday_summary reads only the user's own chat", async () => {
    const r = await setup();
    const yesterday = new Date(Date.now() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    await r.prisma.chatMessage.create({
      data: {
        role: "assistant",
        content: "alice-private",
        sessionDate: yesterday,
        userId: "alice",
      },
    });
    const out = ok(
      await registry.execute(
        "get_yesterday_summary",
        {},
        await ctxFor(r, "bob"),
      ),
    );
    expect(JSON.stringify(out)).not.toContain("alice-private");
  });

  it("operator-only tools return nothing to a regular user", async () => {
    const r = await setup();
    const ctx = await ctxFor(r, "alice");
    expect(ok(await registry.execute("get_playbook", {}, ctx))).toMatchObject({
      found: false,
    });
    expect(
      ok(await registry.execute("get_engineer_messages", {}, ctx)),
    ).toMatchObject({
      found: false,
    });
    expect(
      ok(await registry.execute("get_tool_call_stats", {}, ctx)),
    ).toMatchObject({
      totalCalls: 0,
    });
  });

  it("a hosted context with no scope sees nothing (fail closed)", async () => {
    const r = await setup();
    process.env.AUTH_REQUIRED = "true";
    const out = ok(
      await registry.execute(
        "query_projects",
        { includeBackburner: true },
        { prisma: r.prisma },
      ),
    );
    expect(out.projects).toEqual([]);
  });
});
