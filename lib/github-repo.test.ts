/** Phase 67.3 — githubRepo is stored as `owner/repo`, whatever form it arrives in. */
import { describe, it, expect } from "vitest";
import { normalizeGithubRepo } from "./github-repo";

describe("normalizeGithubRepo", () => {
  it.each([
    ["just/p", "just/p"],
    ["https://github.com/just/p", "just/p"],
    ["https://github.com/just/p.git", "just/p"],
    ["https://github.com/just/p/", "just/p"],
    ["http://www.github.com/Just/P-1", "Just/P-1"],
    ["git@github.com:just/p.git", "just/p"],
    ["github.com/just/p", "just/p"],
    ["  just/p  ", "just/p"],
    ["https://github.com/just/p/tree/main", "just/p"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeGithubRepo(input)).toBe(expected);
  });

  it.each([
    [""],
    ["not a repo"],
    ["https://gitlab.com/just/p"],
    ["just"],
    ["just/p; rm -rf /"],
  ])("rejects %s", (input) => {
    expect(normalizeGithubRepo(input)).toBeNull();
  });
});
