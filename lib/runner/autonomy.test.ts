/** 52.8 — cloud dispatch honors the project's autonomy posture. */
import { describe, it, expect } from "vitest";
import { cloudPermissionFor } from "./autonomy";

describe("cloudPermissionFor", () => {
  it("full autonomy runs unattended with edits accepted", () => {
    expect(cloudPermissionFor("full")).toEqual({
      allowed: true,
      permissionMode: "bypassPermissions",
    });
  });

  it("semi accepts edits but does not bypass everything", () => {
    expect(cloudPermissionFor("semi")).toEqual({
      allowed: true,
      permissionMode: "acceptEdits",
    });
  });

  it("manual is REFUSED — nobody is there to approve a headless run", () => {
    const decision = cloudPermissionFor("manual");
    expect(decision.allowed).toBe(false);
    expect(decision.allowed === false && decision.reason).toMatch(/manual/i);
  });

  it("unknown/missing modes fall back to the safest allowed posture", () => {
    expect(cloudPermissionFor(undefined)).toEqual({
      allowed: true,
      permissionMode: "acceptEdits",
    });
    expect(cloudPermissionFor("nonsense")).toEqual({
      allowed: true,
      permissionMode: "acceptEdits",
    });
  });
});
