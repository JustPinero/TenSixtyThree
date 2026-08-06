/** Phase 51.2 AC1 — the Better Auth handler mounts and answers. */
import { describe, it, expect } from "vitest";
import { GET } from "./route";

describe("/api/auth/[...all]", () => {
  it("serves the session endpoint for anonymous requests (null session, not 5xx)", async () => {
    const res = await GET(
      new Request("http://localhost:3000/api/auth/get-session")
    );
    expect(res.status).toBeLessThan(500);
  });
});
