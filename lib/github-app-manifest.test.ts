/** Phase 74 — the app asks GitHub for the least it needs. */
import { describe, it, expect } from "vitest";
import { buildAppManifest } from "./github-app-manifest";

describe("buildAppManifest", () => {
  const m = buildAppManifest("http://127.0.0.1:4567/callback");

  it("requests only repo contents + pull requests (write) and metadata (read)", () => {
    expect(m.default_permissions).toEqual({
      contents: "write",
      pull_requests: "write",
      metadata: "read",
    });
  });

  it("subscribes to no events and keeps webhooks off", () => {
    expect(m.default_events).toEqual([]);
    expect(m.hook_attributes.active).toBe(false);
  });

  it("returns to the local catcher and is installable by other users", () => {
    expect(m.redirect_url).toBe("http://127.0.0.1:4567/callback");
    expect(m.public).toBe(true);
  });
});
