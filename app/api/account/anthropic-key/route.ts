/**
 * 54.2 — BYOK: users store their own Anthropic key (encrypted at rest
 * via lib/crypto-box). The key is write-only: GET reports presence, the
 * plaintext never leaves the server (see .claude/rules/api-routes.md).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { seal } from "@/lib/crypto-box";

import { isDemoSession } from "@/lib/demo";

async function requireUser(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  if (!session) return null;
  // 54.5 — demo sessions must not write (or read) key material.
  if (isDemoSession(session)) return null;
  return session.user;
}

export async function GET(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { anthropicKeyEnc: true },
  });
  return NextResponse.json({ hasKey: Boolean(row?.anthropicKeyEnc) });
}

export async function PUT(request: NextRequest) {
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
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
  const user = await requireUser(request);
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { anthropicKeyEnc: null },
  });
  return NextResponse.json({ ok: true });
}
