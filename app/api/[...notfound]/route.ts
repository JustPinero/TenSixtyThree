/**
 * 64.5 — unknown /api/* paths answer JSON 404, not the 27 KB HTML page.
 * More specific routes always win over this catch-all.
 */
import { NextResponse } from "next/server";

function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
