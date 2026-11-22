/**
 * Phase 66.2 — lessons harvested from one tenant's projects never reach
 * another tenant's project-chat or wizard system prompt.
 */
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { seedTenants } from "@/tests/harness/tenants";
import { buildProjectSystemPrompt } from "./project-chat";
import { buildWizardSystemPrompt } from "./wizard-prompt";
import { lessonWhere, scopeForViewer } from "./tenant-scope";

let rig: DispatchRig | null = null;
afterEach(async () => {
  await rig?.dispose();
  rig = null;
});

describe("prompt lessons are tenant-scoped", () => {
  it("carol's prompts never include lessons from alice's projects", async () => {
    rig = await createDispatchRig({ fakeTimers: false });
    const t = await seedTenants(rig.prisma);
    for (const p of [t.projects.alices, t.projects.carols]) {
      await rig.prisma.knowledgeLesson.create({
        data: {
          title: `lesson-from-${p.slug}`,
          content: "x",
          category: "tooling",
          severity: "critical",
          sourceProjectId: p.id,
        },
      });
    }
    const scope = await scopeForViewer(rig.prisma, {
      kind: "user",
      userId: "carol",
      isAdmin: false,
      isDemo: false,
    });
    const dir = mkdtempSync(path.join(tmpdir(), "prompt-lessons-"));

    const project = await buildProjectSystemPrompt(
      rig.prisma,
      dir,
      "Carols",
      lessonWhere(scope),
    );
    const wizard = await buildWizardSystemPrompt(
      rig.prisma,
      "# template",
      lessonWhere(scope),
    );
    for (const prompt of [project, wizard]) {
      expect(prompt).toContain("lesson-from-carols");
      expect(prompt).not.toContain("lesson-from-alices");
    }
  });
});
