import { prisma } from "@/lib/db";
import { validateBrainPath } from "@/lib/brain-registry";

/**
 * Phase 48.4 — brain connections. GET: list registered brains. POST: register
 * a repo as a brain (validated: must exist + be a git repo). DELETE: ?id=N.
 */
export async function GET(): Promise<Response> {
  const brains = await prisma.brain.findMany({ orderBy: { id: "asc" } });
  const withStatus = brains.map((b) => ({
    ...b,
    valid: validateBrainPath(b.path).ok,
  }));
  return Response.json({ brains: withStatus });
}

export async function POST(req: Request): Promise<Response> {
  let body: { name?: string; path?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = body.name?.trim();
  const path = body.path?.trim();
  if (!name || !path) {
    return Response.json(
      { error: "name and path are required" },
      { status: 400 },
    );
  }
  const check = validateBrainPath(path);
  if (!check.ok) return Response.json({ error: check.error }, { status: 400 });
  try {
    const brain = await prisma.brain.create({ data: { name, path } });
    return Response.json({ brain });
  } catch {
    return Response.json(
      { error: "That path is already registered" },
      { status: 409 },
    );
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id)) {
    return Response.json({ error: "id required" }, { status: 400 });
  }
  await prisma.brain.delete({ where: { id } }).catch(() => null);
  return Response.json({ ok: true });
}
