import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";
import { resolveBrainPath } from "@/lib/brain-registry";
import { jsonError, requireLocalMode } from "@/lib/access";

const PLAYBOOK_PATH = path.resolve(
  process.cwd(),
  "knowledge",
  "overseer-playbook.md"
);

export async function GET(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const content = await fs.readFile(PLAYBOOK_PATH, "utf-8");
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ content: "" });
  }
}

export async function PUT(request: NextRequest) {
  const access = await requireLocalMode(request);
  if (!access.ok) return access.response;
  try {
    const { content } = await request.json();

    if (typeof content !== "string") {
      return NextResponse.json(
        { error: "content must be a string" },
        { status: 400 }
      );
    }

    await fs.writeFile(PLAYBOOK_PATH, content, "utf-8");

    // Phase 48.4 — write-through to the connected brain, so the canonical
    // copy of the Overseer playbook lives in the personal brain repo
    // (kilroy-brain) and survives/syncs with it. Best-effort: a missing or
    // invalid brain never blocks a local save.
    try {
      const brainPath = await resolveBrainPath(prisma);
      if (brainPath) {
        const target = path.join(brainPath, "playbook", "overseer-playbook.md");
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, "utf-8");
        await prisma.brain.updateMany({ data: { lastSyncedAt: new Date() } });
      }
    } catch {
      // brain mirror is best-effort
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return jsonError(error, "playbook");
  }
}
