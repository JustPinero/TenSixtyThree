import { execSync } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Initialize a git repo with a baseline commit. Sets user.name and
 * user.email locally so `git commit` succeeds even when the host has
 * no global git identity (common on fresh Windows installs).
 * (Moved out of the retired prisma-push.ts in phase 60.1.)
 */
export function gitInitWithAuthor(
  dir: string,
  initialContent?: { file: string; contents: string },
): void {
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.name "Cascade Test"', { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@cascade.local"', { cwd: dir, stdio: "pipe" });
  if (initialContent) {
    fs.writeFileSync(path.join(dir, initialContent.file), initialContent.contents);
  }
  execSync("git add -A", { cwd: dir, stdio: "pipe" });
  execSync('git commit --allow-empty -m "init"', { cwd: dir, stdio: "pipe" });
}
