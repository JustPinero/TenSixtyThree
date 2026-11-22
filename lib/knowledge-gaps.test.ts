import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { detectKnowledgeGaps } from "./knowledge-gaps";


let prisma: PrismaClient;
let rig: DispatchRig | null = null;

beforeAll(async () => {

  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  // Create lessons in only some categories
  await prisma.knowledgeLesson.createMany({
    data: [
      { title: "L1", content: "C1", category: "database", tags: "[]" },
      { title: "L2", content: "C2", category: "database", tags: "[]" },
      { title: "L3", content: "C3", category: "database", tags: "[]" },
      { title: "L4", content: "C4", category: "testing", tags: "[]" },
      // Other categories empty or thin
    ],
  });
});

afterAll(async () => {
  await rig?.dispose();
  rig = null;
});

describe("knowledge-gaps", () => {
  it("detects empty categories", async () => {
    const gaps = await detectKnowledgeGaps(prisma);
    const emptyGaps = gaps.filter((g) => g.count === 0);
    expect(emptyGaps.length).toBeGreaterThan(0);
    expect(emptyGaps[0].priority).toBe("high");
  });

  it("detects thin categories below threshold", async () => {
    const gaps = await detectKnowledgeGaps(prisma, 2);
    const thinGaps = gaps.filter(
      (g) => g.count > 0 && g.count < 2
    );
    expect(thinGaps.length).toBeGreaterThanOrEqual(1);
    expect(thinGaps[0].category).toBe("testing");
  });

  it("does not flag well-covered categories", async () => {
    const gaps = await detectKnowledgeGaps(prisma, 2);
    const databaseGap = gaps.find((g) => g.category === "database");
    expect(databaseGap).toBeUndefined();
  });

  it("configurable threshold", async () => {
    const strictGaps = await detectKnowledgeGaps(prisma, 5);
    const lenientGaps = await detectKnowledgeGaps(prisma, 1);
    expect(strictGaps.length).toBeGreaterThanOrEqual(lenientGaps.length);
  });

  it("sorts by priority", async () => {
    const gaps = await detectKnowledgeGaps(prisma);
    if (gaps.length > 1) {
      const priorities = gaps.map((g) => g.priority);
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      for (let i = 1; i < priorities.length; i++) {
        expect(priorityOrder[priorities[i]]).toBeGreaterThanOrEqual(
          priorityOrder[priorities[i - 1]]
        );
      }
    }
  });
});
