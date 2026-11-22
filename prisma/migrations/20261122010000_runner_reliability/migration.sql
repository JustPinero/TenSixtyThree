-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cancelRequested" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DispatchOutcome" ADD COLUMN     "costUsd" DOUBLE PRECISION,
ADD COLUMN     "turns" INTEGER;
