/**
 * Phase 59.3 — destructive-migration guard. A migration that can lose data
 * fails CI unless its author marks it `-- allow-destructive` on purpose.
 */
import { describe, it, expect } from "vitest";
import { findDestructiveStatements, checkMigration } from "./migration-guard";

describe("findDestructiveStatements", () => {
  it.each([
    ['DROP TABLE "Project";'],
    ['ALTER TABLE "Project" DROP COLUMN "badges";'],
    ['drop table if exists "Ticket" cascade;'],
    [
      'ALTER TABLE "Project" ALTER COLUMN "status" SET DATA TYPE INTEGER USING 0;',
    ],
    ['ALTER TABLE "Project" ALTER COLUMN "status" TYPE INTEGER;'],
    ["DROP SCHEMA public CASCADE;"],
    ['DROP TYPE "Role";'],
    ['TRUNCATE "ActivityEvent";'],
    ['DELETE FROM "ActivityEvent";'],
  ])("flags %s", (sql) => {
    expect(findDestructiveStatements(sql)).toHaveLength(1);
  });

  it.each([
    ['CREATE TABLE "Foo" ("id" TEXT NOT NULL);'],
    ['ALTER TABLE "Project" ADD COLUMN "x" TEXT;'],
    ['DROP INDEX "Project_slug_idx";'],
    ['ALTER TABLE "Project" ALTER COLUMN "status" DROP DEFAULT;'],
    ['ALTER TABLE "Project" ALTER COLUMN "status" DROP NOT NULL;'],
    ['ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_boardId_fkey";'],
    ['-- DROP TABLE "Project"; (a comment, not a statement)'],
  ])("allows %s", (sql) => {
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("reports every destructive statement in a multi-statement file", () => {
    const sql =
      'DROP TABLE "A";\nCREATE TABLE "B" ("id" TEXT);\nALTER TABLE "C" DROP COLUMN "d";';
    expect(findDestructiveStatements(sql)).toEqual([
      'DROP TABLE "A"',
      'ALTER TABLE "C" DROP COLUMN "d"',
    ]);
  });
});

describe("checkMigration", () => {
  it("fails a DROP without the marker", () => {
    const res = checkMigration('ALTER TABLE "Project" DROP COLUMN "badges";');
    expect(res.ok).toBe(false);
    expect(res.offenders).toHaveLength(1);
  });

  it("passes the same DROP when the author marks it -- allow-destructive", () => {
    const res = checkMigration(
      '-- allow-destructive: badges moved to ProjectBadge in 0_x\nALTER TABLE "Project" DROP COLUMN "badges";',
    );
    expect(res.ok).toBe(true);
  });

  it("passes a purely additive migration", () => {
    expect(
      checkMigration('ALTER TABLE "Project" ADD COLUMN "x" TEXT;').ok,
    ).toBe(true);
  });
});
