import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@/app/generated/prisma/client";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";


// Phase 30 — the `templates/` directory is gitignored (each user
// populates it themselves) and may not exist on a fresh checkout.
// Skip the whole file when the default template is missing instead of
// failing the suite with an ENOENT from the seed subprocess.
const DEFAULT_TEMPLATE_PATH = path.resolve(
  __dirname,
  "../templates/universal-v4_0.md"
);
const templatesAvailable = fs.existsSync(DEFAULT_TEMPLATE_PATH);
const describeIfTemplates = templatesAvailable ? describe : describe.skip;

let prisma: PrismaClient;
let rig: DispatchRig | null = null;

function runSeed() {
  execSync("npx tsx prisma/seed.ts", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    // The seed runs in a subprocess against THIS rig's database.
    env: { ...process.env, DATABASE_URL: rig!.dbUrl },
  });
}

beforeAll(async () => {
  if (!templatesAvailable) return;
  rig = await createDispatchRig({ fakeTimers: false });
  prisma = rig.prisma;

  // Run seed
  runSeed();
});

afterAll(async () => {
  if (!templatesAvailable) return;
  await rig?.dispose();
  rig = null;
});

// The six canonical v4.0 kickoff templates and their expected
// projectType mapping (KickoffTemplate.projectType enum-by-convention:
// web-app | game | api | mobile | other).
const V4_TEMPLATES: {
  filename: string;
  projectType: string;
  isDefault: boolean;
}[] = [
  { filename: "universal-v4_0.md", projectType: "other", isDefault: true },
  { filename: "web-app-v4_0.md", projectType: "web-app", isDefault: false },
  { filename: "api-service-v4_0.md", projectType: "api", isDefault: false },
  { filename: "mobile-app-v4_0.md", projectType: "mobile", isDefault: false },
  { filename: "site-rebuild-v4_0.md", projectType: "web-app", isDefault: false },
  { filename: "game-dev-v4_0.md", projectType: "game", isDefault: false },
];

describeIfTemplates("template seeding (v4.0)", () => {
  it("seeds exactly the six v4.0 templates", async () => {
    const templates = await prisma.kickoffTemplate.findMany();
    expect(templates).toHaveLength(6);
  });

  it("all six v4.0 template files exist in templates/", () => {
    for (const tmpl of V4_TEMPLATES) {
      const templatePath = path.resolve(
        __dirname,
        "../templates",
        tmpl.filename
      );
      expect(fs.existsSync(templatePath), tmpl.filename).toBe(true);
    }
  });

  it("each row's content matches its v4.0 file on disk", async () => {
    for (const tmpl of V4_TEMPLATES) {
      const templatePath = path.resolve(
        __dirname,
        "../templates",
        tmpl.filename
      );
      const fileContent = fs.readFileSync(templatePath, "utf-8");

      const row = await prisma.kickoffTemplate.findFirst({
        where: { content: fileContent },
      });
      expect(row, `no row seeded from ${tmpl.filename}`).not.toBeNull();
    }
  });

  it("maps each template to the correct projectType", async () => {
    for (const tmpl of V4_TEMPLATES) {
      const templatePath = path.resolve(
        __dirname,
        "../templates",
        tmpl.filename
      );
      const fileContent = fs.readFileSync(templatePath, "utf-8");

      const row = await prisma.kickoffTemplate.findFirst({
        where: { content: fileContent },
      });
      expect(row, `no row seeded from ${tmpl.filename}`).not.toBeNull();
      expect(row!.projectType, tmpl.filename).toBe(tmpl.projectType);
    }
  });

  it("the universal template is the sole default", async () => {
    const defaults = await prisma.kickoffTemplate.findMany({
      where: { isDefault: true },
    });
    expect(defaults).toHaveLength(1);

    const universalContent = fs.readFileSync(
      path.resolve(__dirname, "../templates/universal-v4_0.md"),
      "utf-8"
    );
    expect(defaults[0].content).toBe(universalContent);
    expect(defaults[0].projectType).toBe("other");
  });

  it("every seeded template has non-empty content on playbook VERSION 4.x", async () => {
    const templates = await prisma.kickoffTemplate.findMany();
    expect(templates).toHaveLength(6);
    for (const row of templates) {
      expect(row.content.length, row.name).toBeGreaterThan(0);
      // Files keep their -v4_0 names; the VERSION line moves within 4.x (4.1 since 2026-11-13).
      expect(row.content, row.name).toMatch(/VERSION: 4\.\d+/);
    }
  });

  it("seed is idempotent — running twice keeps exactly 6 rows", async () => {
    runSeed();

    const templates = await prisma.kickoffTemplate.findMany();
    expect(templates).toHaveLength(6);
  });
});
