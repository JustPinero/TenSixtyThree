/**
 * Phase 64.1 — behavioural half of the coverage contract.
 *
 * Hosted mode (AUTH_REQUIRED=true): every non-public handler answers a
 * request with NO cookie, and one with a syntactically valid but unknown
 * cookie (the 2026-11-16 production hole), with 401 — or 403
 * hostedUnsupported for local-only surfaces. Nothing else runs first.
 */
import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { createDispatchRig } from "@/tests/harness/dispatch-rig";
import type { DispatchRig } from "@/tests/harness/dispatch-rig.types";

const ROOT = path.resolve(__dirname, "..");
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

let rig: DispatchRig;
const ORIGINAL = process.env.AUTH_REQUIRED;
beforeAll(async () => {
  process.env.AUTH_REQUIRED = "true";
  rig = await createDispatchRig({ fakeTimers: false });
  vi.doMock("@/lib/db", () => ({ prisma: rig.prisma }));
});
afterAll(async () => {
  await rig.dispose();
  if (ORIGINAL === undefined) delete process.env.AUTH_REQUIRED;
  else process.env.AUTH_REQUIRED = ORIGINAL;
});

const files = routeFiles(path.join(ROOT, "app", "api")).map((f) =>
  path.relative(ROOT, f),
);

describe("hosted: unauthenticated requests are refused by every guarded handler", () => {
  for (const rel of files) {
    it(rel, async () => {
      const { PUBLIC_ROUTES } = await import("./access");
      if (PUBLIC_ROUTES.includes(rel)) return;
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      const localOnly = /requireLocalMode\(/.test(src);
      const mod = (await import(`@/${rel.replace(/\.ts$/, "")}`)) as Record<
        string,
        unknown
      >;
      for (const m of METHODS) {
        const handler = mod[m] as Handler | undefined;
        if (typeof handler !== "function") continue;
        for (const cookie of [null, "better-auth.session_token=made-up.sig"]) {
          const req = new NextRequest(`http://x/${rel}`, {
            method: m,
            headers: cookie
              ? { cookie, "content-type": "application/json" }
              : { "content-type": "application/json" },
            ...(m === "GET" ? {} : { body: "{}" }),
          });
          const res = await handler(req, {
            params: Promise.resolve({ slug: "x", id: "x" }),
          });
          const label = `${m} ${rel} cookie=${cookie ? "made-up" : "none"}`;
          if (localOnly && /requireLocalMode\(/.test(handlerSlice(src, m))) {
            expect(res.status, label).toBe(403);
          } else {
            expect(res.status, label).toBe(401);
          }
        }
      }
    });
  }
});

function handlerSlice(src: string, method: string): string {
  const start = src.search(
    new RegExp(`^export\\s+(?:async\\s+)?function\\s+${method}\\b`, "m"),
  );
  if (start < 0) return "";
  const rest = src.slice(start + 1);
  const next = rest.search(/^export\s/m);
  return next < 0 ? src.slice(start) : src.slice(start, start + 1 + next);
}
