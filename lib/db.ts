import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Phase 51.1 — Postgres everywhere (hosted-foundation). DATABASE_URL is a
// postgres:// URL; local dev runs the tensixtythree-pg Docker container
// (postgres:16 on 127.0.0.1:51063). The old better-sqlite3 adapter and the
// file:./dev.db convention are retired (data migration: scripts/migrate-dev-db.ts).
const adapter = new PrismaPg({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://tensixtythree:tensixtythree@localhost:51063/tensixtythree",
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
