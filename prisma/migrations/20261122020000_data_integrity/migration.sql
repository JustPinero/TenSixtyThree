-- Phase 70 data integrity. No row data changes: foreign keys are re-created
-- with ON DELETE CASCADE (Project children) so deleting a project (demo
-- sweep) works; Ticket.linearIssueId becomes unique per board; FK indexes;
-- AnthropicUsageEvent gains userId/keySource for spend attribution.

-- DropForeignKey
ALTER TABLE "ActivityEvent" DROP CONSTRAINT "ActivityEvent_projectId_fkey";

-- DropForeignKey
ALTER TABLE "AuditSnapshot" DROP CONSTRAINT "AuditSnapshot_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Dispatch" DROP CONSTRAINT "Dispatch_projectId_fkey";

-- DropForeignKey
ALTER TABLE "DispatchOutcome" DROP CONSTRAINT "DispatchOutcome_dispatchId_fkey";

-- DropForeignKey
ALTER TABLE "DispatchOutcome" DROP CONSTRAINT "DispatchOutcome_projectId_fkey";

-- DropForeignKey
ALTER TABLE "FeatureProposal" DROP CONSTRAINT "FeatureProposal_projectId_fkey";

-- DropForeignKey
ALTER TABLE "HumanTask" DROP CONSTRAINT "HumanTask_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectFeatureUsage" DROP CONSTRAINT "ProjectFeatureUsage_projectId_fkey";

-- DropIndex
DROP INDEX "ticket_linearIssueId_key";

-- AlterTable
ALTER TABLE "AnthropicUsageEvent" ADD COLUMN     "keySource" TEXT NOT NULL DEFAULT 'app',
ADD COLUMN     "userId" TEXT;

-- CreateIndex
CREATE INDEX "AnthropicUsageEvent_userId_createdAt_idx" ON "AnthropicUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Dispatch_ownerUserId_idx" ON "Dispatch"("ownerUserId");

-- CreateIndex
CREATE INDEX "HumanTask_projectId_idx" ON "HumanTask"("projectId");

-- CreateIndex
CREATE INDEX "HumanTask_ownerUserId_idx" ON "HumanTask"("ownerUserId");

-- CreateIndex
CREATE INDEX "org_post_authorUserId_idx" ON "org_post"("authorUserId");

-- CreateIndex
CREATE INDEX "org_post_projectId_idx" ON "org_post"("projectId");

-- CreateIndex
CREATE INDEX "ticket_boardId_idx" ON "ticket"("boardId");

-- CreateIndex
CREATE INDEX "ticket_milestoneId_idx" ON "ticket"("milestoneId");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_boardId_linearIssueId_key" ON "ticket"("boardId", "linearIssueId");

-- AddForeignKey
ALTER TABLE "AuditSnapshot" ADD CONSTRAINT "AuditSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOutcome" ADD CONSTRAINT "DispatchOutcome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOutcome" ADD CONSTRAINT "DispatchOutcome_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTask" ADD CONSTRAINT "HumanTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeatureUsage" ADD CONSTRAINT "ProjectFeatureUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureProposal" ADD CONSTRAINT "FeatureProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
