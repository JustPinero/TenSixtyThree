import { describe, it, expect } from "vitest";
import { GET, POST } from "./route";

describe("unknown /api/* (64.5)", () => {
  it("answers JSON 404", async () => {
    for (const h of [GET, POST]) {
      const res = h();
      expect(res.status).toBe(404);
      expect(res.headers.get("content-type")).toContain("application/json");
      expect(await res.json()).toEqual({ error: "Not found" });
    }
  });
});
