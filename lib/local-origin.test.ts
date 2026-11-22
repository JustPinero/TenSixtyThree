/**
 * Phase 70 — local mode has no auth, so a web page the operator visits
 * must not be able to drive the dashboard (CSRF / DNS rebinding).
 */
import { describe, it, expect } from "vitest";
import { localOriginDecision } from "./local-origin";

const base = {
  authRequired: false,
  method: "POST",
  host: "127.0.0.1:3000",
  origin: null,
};

describe("localOriginDecision", () => {
  it("allows same-origin and Origin-less (curl, the Stop hook) loopback writes", () => {
    expect(
      localOriginDecision({ ...base, origin: "http://127.0.0.1:3000" }),
    ).toBe("allow");
    expect(
      localOriginDecision({
        ...base,
        host: "localhost:3000",
        origin: "http://localhost:3000",
      }),
    ).toBe("allow");
    expect(localOriginDecision(base)).toBe("allow");
  });

  it("rejects a write from a foreign Origin", () => {
    expect(
      localOriginDecision({ ...base, origin: "https://evil.example" }),
    ).toBe("reject");
    expect(
      localOriginDecision({ ...base, origin: "http://127.0.0.1:4000" }),
    ).toBe("reject");
    expect(localOriginDecision({ ...base, origin: "null" })).toBe("reject");
  });

  it("rejects a write whose Host is not loopback (DNS rebinding)", () => {
    expect(localOriginDecision({ ...base, host: "evil.example" })).toBe(
      "reject",
    );
    expect(
      localOriginDecision({
        ...base,
        host: "evil.example",
        origin: "http://evil.example",
      }),
    ).toBe("reject");
  });

  it("reads are not affected; the hosted app is not affected", () => {
    expect(
      localOriginDecision({
        ...base,
        method: "GET",
        origin: "https://evil.example",
      }),
    ).toBe("allow");
    expect(
      localOriginDecision({
        ...base,
        authRequired: true,
        host: "www.tensixtythree.com",
        origin: "https://x.dev",
      }),
    ).toBe("allow");
  });

  it("covers every state-changing method", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        localOriginDecision({
          ...base,
          method,
          origin: "https://evil.example",
        }),
      ).toBe("reject");
    }
  });
});
