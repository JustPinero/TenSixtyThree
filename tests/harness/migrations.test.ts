/**
 * Phase 59 — [51.D1] the schema ships as a migration chain, not `db push`.
 *
 * The test template database is built by `prisma migrate deploy`, so every
 * rig exercises the real chain hosted will run, and the chain must produce
 * exactly prisma/schema.prisma (a schema edit without a migration fails).
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import path from "path";
import { createDispatchRig } from "./dispatch-rig";
import type { DispatchRig } from "./dispatch-rig.types";

const CASCADE_ROOT = path.resolve(__dirname, "..", "..");

const rigs: DispatchRig[] = [];
afterEach(async () => {
  while (rigs.length) await rigs.pop()?.dispose();
});

async function rig() {
  const r = await createDispatchRig({ fakeTimers: false });
  rigs.push(r);
  return r;
}

/** Run the Prisma CLI against one rig database; returns the exit code. */
async function prisma(dbUrl: string, args: string[]): Promise<number> {
  // Real child_process: other suites vi.mock it.
  const cp =
    await vi.importActual<typeof import("child_process")>("child_process");
  const res = cp.spawnSync("pnpm", ["exec", "prisma", ...args], {
    cwd: CASCADE_ROOT,
    env: { ...process.env, DATABASE_URL: dbUrl },
    encoding: "utf8",
  });
  return res.status ?? 1;
}

async function appliedMigrations(r: DispatchRig): Promise<string[]> {
  const rows = await r.prisma.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
    ORDER BY migration_name`;
  return rows.map((row) => row.migration_name);
}

describe("migration chain (Phase 59)", () => {
  it("the test template is built by migrate deploy (59.2)", async () => {
    const r = await rig();
    expect(await appliedMigrations(r)).toContain("0_init");
  });

  it("resetting a reused worker database keeps the migration history (59.2)", async () => {
    // First rig in a worker clones the template; the next one TRUNCATEs
    // and reuses it. The reset must not wipe _prisma_migrations, or
    // `migrate status` would report every migration as unapplied.
    const first = await rig();
    await first.dispose();
    rigs.pop();
    const second = await rig();
    expect(await appliedMigrations(second)).toContain("0_init");
  });

  it("migrate status is clean on a migration-built database (59.1)", async () => {
    const r = await rig();
    expect(await prisma(r.dbUrl, ["migrate", "status"])).toBe(0);
  }, 60_000);

  it("the migration chain produces exactly schema.prisma — no drift", async () => {
    const r = await rig();
    // --exit-code: 0 = no difference, 2 = schema.prisma has changes no
    // migration covers (write one with `prisma migrate dev`).
    const code = await prisma(r.dbUrl, [
      "migrate",
      "diff",
      "--from-config-datasource",
      "--to-schema",
      "prisma/schema.prisma",
      "--exit-code",
    ]);
    expect(code).toBe(0);
  }, 60_000);
});

describe("phase 70 — data integrity schema", () => {
  it("FK lookup indexes exist", async () => {
    const r = await rig();
    const rows = await r.prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`;
    const names = new Set(rows.map((x) => x.indexname));
    for (const idx of [
      "ticket_boardId_idx",
      "ticket_milestoneId_idx",
      "ticket_boardId_linearIssueId_key",
      "org_post_authorUserId_idx",
      "org_post_projectId_idx",
      "HumanTask_projectId_idx",
      "HumanTask_ownerUserId_idx",
      "Dispatch_ownerUserId_idx",
    ]) {
      expect(names.has(idx), idx).toBe(true);
    }
    expect(names.has("ticket_linearIssueId_key")).toBe(false);
  });

  it("deleting a project removes its children (FeatureProposal included)", async () => {
    const r = await rig();
    const project = await r.prisma.project.create({
      data: { name: "x", slug: "x", path: "/p/x" },
    });
    const feature = await r.prisma.upstreamFeature.create({
      data: { name: "f", category: "hook", description: "d", integrationRecipe: "r" },
    });
    await r.prisma.featureProposal.create({
      data: { projectId: project.id, featureId: feature.id, diff: "d" },
    });
    await r.prisma.projectFeatureUsage.create({
      data: { projectId: project.id, featureId: feature.id, signal: "s" },
    });
    const dispatch = await r.prisma.dispatch.create({
      data: { projectId: project.id, projectSlug: "x", mode: "audit" },
    });
    await r.prisma.dispatchOutcome.create({
      data: {
        projectId: project.id,
        projectSlug: "x",
        mode: "audit",
        healthAtDispatch: "idle",
        outcome: "success",
        dispatchedAt: new Date(),
        dispatchId: dispatch.id,
      },
    });
    await r.prisma.humanTask.create({ data: { title: "t", projectId: project.id } });
    await r.prisma.activityEvent.create({
      data: { projectId: project.id, eventType: "commit", summary: "s" },
    });
    await r.prisma.project.delete({ where: { id: project.id } });
    expect(await r.prisma.featureProposal.count()).toBe(0);
    expect(await r.prisma.dispatch.count()).toBe(0);
    expect(await r.prisma.humanTask.count()).toBe(0);
  });
});
