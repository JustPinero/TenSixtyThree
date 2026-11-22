/** Phase 69.3 — the wizard template is capped before any model call. */
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const fetchSpy = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findUnique: vi.fn().mockResolvedValue(null) },
    cascadeConfig: { findUnique: vi.fn().mockResolvedValue(null) },
    knowledgeLesson: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/rate-limiter", () => ({
  checkRateLimit: vi.fn().mockReturnValue(null),
  getRateLimitKey: vi.fn().mockReturnValue("k"),
}));

import { POST } from "./route";

beforeEach(() => {
  delete process.env.AUTH_REQUIRED;
  process.env.ANTHROPIC_API_KEY = "sk-test";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

function req(templateContent: string) {
  return new NextRequest("http://127.0.0.1:3000/api/wizard/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      templateContent,
      messages: [{ role: "user", content: "hi" }],
    }),
  });
}

describe("POST /api/wizard/chat", () => {
  it("rejects an oversized template with 413 and never calls the model", async () => {
    const res = await POST(req("x".repeat(60_001)));
    expect(res.status).toBe(413);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-string template", async () => {
    const res = await POST(
      new NextRequest("http://127.0.0.1:3000/api/wizard/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateContent: { a: 1 },
          messages: [{ role: "user", content: "hi" }],
        }),
      }),
    );
    expect(res.status).toBe(400);
  });
});
