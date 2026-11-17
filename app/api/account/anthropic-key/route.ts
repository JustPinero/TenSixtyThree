/**
 * 54.2 — BYOK: users store their own Anthropic key (encrypted at rest
 * via lib/crypto-box). The key is write-only: GET reports presence, the
 * plaintext never leaves the server (see .claude/rules/api-routes.md).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSignedIn } from "@/lib/access";
import { seal } from "@/lib/crypto-box";

export async function GET(request: NextRequest) {
  const gate = await requireSignedIn(request);
  if (!gate.ok) return gate.response;
  // 54.5 — demo sessions must not write (or read) key material.
  if (gate.viewer.isDemo) {
    return NextResponse.json({ error: "Not available in the demo" }, { status: 403 });
  }
  const user = { id: gate.viewer.userId };
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { anthropicKeyEnc: true },
  });
  return NextResponse.json({ hasKey: Boolean(row?.anthropicKeyEnc) });
}

export async function PUT(request: NextRequest) {
  const gate = await requireSignedIn(request);
  if (!gate.ok) return gate.response;
  // 54.5 — demo sessions must not write (or read) key material.
  if (gate.viewer.isDemo) {
    return NextResponse.json({ error: "Not available in the demo" }, { status: 403 });
  }
  const user = { id: gate.viewer.userId };
  const body = await request.json();
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key.startsWith("sk-ant-") || key.length < 20 || key.length > 300) {
    return NextResponse.json(
      { error: "That doesn't look like an Anthropic API key (sk-ant-...)" },
      { status: 400 }
    );
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { anthropicKeyEnc: seal(key) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireSignedIn(request);
  if (!gate.ok) return gate.response;
  // 54.5 — demo sessions must not write (or read) key material.
  if (gate.viewer.isDemo) {
    return NextResponse.json({ error: "Not available in the demo" }, { status: 403 });
  }
  const user = { id: gate.viewer.userId };
  await prisma.user.update({
    where: { id: user.id },
    data: { anthropicKeyEnc: null },
  });
  return NextResponse.json({ ok: true });
}
