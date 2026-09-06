/** 52.2 — file-tool path scoping. */
import { describe, it, expect } from "vitest";
import { classifyToolUse } from "./real-deps";

const W = "/tmp/runner-abc";

describe("classifyToolUse", () => {
  it("allows file tools inside the workspace, relative or absolute", () => {
    expect(classifyToolUse("Read", { file_path: `${W}/src/a.ts` }, W).allowed).toBe(true);
    expect(classifyToolUse("Edit", { file_path: "src/a.ts" }, W).allowed).toBe(true);
    expect(classifyToolUse("Glob", { path: W }, W).allowed).toBe(true);
  });

  it("denies escapes: absolute, traversal, sibling-prefix", () => {
    expect(classifyToolUse("Read", { file_path: "/root/.claude.json" }, W).allowed).toBe(false);
    expect(classifyToolUse("Write", { file_path: `${W}/../evil` }, W).allowed).toBe(false);
    expect(classifyToolUse("Read", { file_path: `${W}-sibling/x` }, W).allowed).toBe(false);
  });

  it("non-file tools pass through", () => {
    expect(classifyToolUse("Bash", { command: "cat /etc/hostname" }, W).allowed).toBe(true);
    expect(classifyToolUse("WebFetch", { url: "https://x" }, W).allowed).toBe(true);
  });
});
