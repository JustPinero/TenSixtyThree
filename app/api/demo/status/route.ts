/** 54.5 — is this session a demo? Powers the demo banner. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getServerSession } from "@/lib/auth-helpers";
import { isDemoSession } from "@/lib/demo";

export async function GET(request: NextRequest) {
  const session = await getServerSession(prisma, request.headers);
  return NextResponse.json({ demo: isDemoSession(session) });
}
