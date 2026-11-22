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

describe("60.4 [1.0.D5] — symlinks are resolved before the containment check", () => {
  it("a symlink inside the workspace that points outside is classified as outside", async () => {
    const { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, realpathSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const base = realpathSync(mkdtempSync(join(tmpdir(), "classify-")));
    const workdir = join(base, "work");
    const outside = join(base, "outside");
    mkdirSync(workdir);
    mkdirSync(outside);
    writeFileSync(join(outside, "secret.txt"), "s");
    symlinkSync(outside, join(workdir, "escape"));
    mkdirSync(join(workdir, "src"));
    symlinkSync(join(workdir, "src"), join(workdir, "alias"));

    expect(classifyToolUse("Read", { file_path: "escape/secret.txt" }, workdir).allowed).toBe(false);
    expect(classifyToolUse("Write", { file_path: "escape/new.txt" }, workdir).allowed).toBe(false);
    // Inside-pointing links and not-yet-existing files inside stay allowed.
    expect(classifyToolUse("Read", { file_path: "alias/x.ts" }, workdir).allowed).toBe(true);
    expect(classifyToolUse("Write", { file_path: "src/new/deep.ts" }, workdir).allowed).toBe(true);
  });

  it("review — a DANGLING symlink pointing outside is still outside (Write would follow it)", async () => {
    const { mkdtempSync, mkdirSync, symlinkSync, realpathSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const base = realpathSync(mkdtempSync(join(tmpdir(), "classify-dangling-")));
    const workdir = join(base, "work");
    mkdirSync(workdir);
    symlinkSync(join(base, "outside", "not-yet.md"), join(workdir, "notes.md"));
    symlinkSync(join(workdir, "later.md"), join(workdir, "inside-link.md"));
    expect(classifyToolUse("Write", { file_path: "notes.md" }, workdir).allowed).toBe(false);
    expect(classifyToolUse("Write", { file_path: "inside-link.md" }, workdir).allowed).toBe(true);
  });
});

