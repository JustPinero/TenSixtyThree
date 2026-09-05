import { describe, it, expect } from "vitest";
import { decideUserCreation } from "./invite-gate";

const NOW = new Date("2026-09-04T12:00:00Z");
const FRESH = new Date("2026-09-05T12:00:00Z");
const STALE = new Date("2026-09-01T12:00:00Z");

function base() {
  return {
    email: "new@user.dev",
    now: NOW,
    adminEmails: ["justin@ops.dev"],
    orgInvites: [] as { email: string; status: string; expiresAt: Date }[],
    userInvites: [] as {
      email: string;
      expiresAt: Date;
      acceptedAt: Date | null;
    }[],
  };
}

describe("decideUserCreation", () => {
  it("denies an unknown email", () => {
    expect(decideUserCreation(base()).allowed).toBe(false);
  });

  it("allows a pending unexpired org invitation", () => {
    const input = base();
    input.orgInvites = [
      { email: "new@user.dev", status: "pending", expiresAt: FRESH },
    ];
    expect(decideUserCreation(input).allowed).toBe(true);
  });

  it("denies expired or non-pending org invitations", () => {
    const input = base();
    input.orgInvites = [
      { email: "new@user.dev", status: "pending", expiresAt: STALE },
      { email: "new@user.dev", status: "canceled", expiresAt: FRESH },
    ];
    expect(decideUserCreation(input).allowed).toBe(false);
  });

  it("allows a pending unexpired independent UserInvite", () => {
    const input = base();
    input.userInvites = [
      { email: "new@user.dev", expiresAt: FRESH, acceptedAt: null },
    ];
    expect(decideUserCreation(input).allowed).toBe(true);
  });

  it("denies expired or already-accepted UserInvites", () => {
    const input = base();
    input.userInvites = [
      { email: "new@user.dev", expiresAt: STALE, acceptedAt: null },
      { email: "new@user.dev", expiresAt: FRESH, acceptedAt: STALE },
    ];
    expect(decideUserCreation(input).allowed).toBe(false);
  });

  it("always allows the admin bootstrap allowlist", () => {
    const input = base();
    input.email = "justin@ops.dev";
    expect(decideUserCreation(input).allowed).toBe(true);
  });

  it("matches emails case-insensitively everywhere", () => {
    const input = base();
    input.email = "New@USER.dev";
    input.userInvites = [
      { email: "NEW@user.DEV", expiresAt: FRESH, acceptedAt: null },
    ];
    expect(decideUserCreation(input).allowed).toBe(true);

    const admin = base();
    admin.email = "JUSTIN@ops.dev";
    expect(decideUserCreation(admin).allowed).toBe(true);
  });

  it("reports which gate allowed (org-invite | user-invite | admin)", () => {
    const admin = base();
    admin.email = "justin@ops.dev";
    expect(decideUserCreation(admin).via).toBe("admin");

    const org = base();
    org.orgInvites = [
      { email: "new@user.dev", status: "pending", expiresAt: FRESH },
    ];
    expect(decideUserCreation(org).via).toBe("org-invite");
  });
});
