-- Phase 66 tenant scoping. Additive only.
-- PRE-DEPLOY CHECK (hosted): the member unique index fails if duplicate
-- (userId, organizationId) rows exist. Run first:
--   SELECT "userId","organizationId",count(*) FROM member GROUP BY 1,2 HAVING count(*)>1;
-- A failure here aborts the deploy without changing data.

-- AlterTable
ALTER TABLE "ActivityEvent" ADD COLUMN     "dispatchId" TEXT;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN     "ownerUserId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "chatModel" TEXT;

-- CreateIndex
CREATE INDEX "ActivityEvent_dispatchId_idx" ON "ActivityEvent"("dispatchId");

-- CreateIndex
CREATE INDEX "ChatMessage_userId_sessionDate_createdAt_idx" ON "ChatMessage"("userId", "sessionDate", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_userId_startedAt_idx" ON "ChatSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "Reminder_ownerUserId_idx" ON "Reminder"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "member_userId_organizationId_key" ON "member"("userId", "organizationId");

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
