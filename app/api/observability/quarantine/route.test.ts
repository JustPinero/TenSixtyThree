/** Phase 46.1 — quarantine observability endpoint. */
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("/api/observability/quarantine", () => {
  it("returns a well-formed status", async () => {
    const body = await (await GET()).json();
    expect(typeof body.count).toBe("number");
    expect(body).toHaveProperty("lastLine");
    expect(String(body.path)).toMatch(/quarantine/);
  });
});
