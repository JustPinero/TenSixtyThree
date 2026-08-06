/**
 * Phase 51.1 — the SQLite WAL-pragma behavior is retired with the Postgres
 * migration. The contract now: applySqlitePragmas is a silent no-op on
 * postgres:// URLs and NEVER throws regardless of client behavior (a pragma
 * preference must never block boot).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { applySqlitePragmas } from "./db-pragmas";

afterEach(() => {
  delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
});

describe("applySqlitePragmas (Postgres era)", () => {
  it("is a no-op on a postgres DATABASE_URL — client never queried", async () => {
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    const client = { $queryRawUnsafe: vi.fn() };
    await applySqlitePragmas(client);
    expect(client.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it("still attempts pragmas on a non-postgres URL (legacy sqlite path)", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const client = { $queryRawUnsafe: vi.fn().mockResolvedValue([]) };
    await applySqlitePragmas(client);
    expect(client.$queryRawUnsafe).toHaveBeenCalledWith(
      "PRAGMA journal_mode=WAL;"
    );
  });

  it("never throws even when the client errors", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const client = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error("boom")),
    };
    await expect(applySqlitePragmas(client)).resolves.toBeUndefined();
  });
});
