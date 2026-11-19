-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Project" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'building',
    "stack" TEXT NOT NULL DEFAULT '{}',
    "currentPhase" TEXT NOT NULL DEFAULT 'phase-1-foundation',
    "currentRequest" TEXT,
    "health" TEXT NOT NULL DEFAULT 'idle',
    "healthDetails" TEXT NOT NULL DEFAULT '{}',
    "githubRepo" TEXT,
    "autonomyMode" TEXT NOT NULL DEFAULT 'semi',
    "agentTeamsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "prWorkflowEnabled" BOOLEAN NOT NULL DEFAULT false,
    "progressScore" INTEGER NOT NULL DEFAULT 0,
    "progressDetails" TEXT NOT NULL DEFAULT '{}',
    "deploymentInfo" TEXT NOT NULL DEFAULT '{}',
    "businessStage" TEXT NOT NULL DEFAULT 'building',
    "projectContext" TEXT,
    "completionCriteria" TEXT,
    "badges" TEXT NOT NULL DEFAULT '[]',
    "themeKey" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "ownerUserId" TEXT,
    "deadline" TIMESTAMP(3),
    "lastSessionEndedAt" TIMESTAMP(3),
    "kickoffTemplateId" INTEGER,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeLesson" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sourceProjectId" INTEGER,
    "sourceFile" TEXT,
    "sourcePhase" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "severity" TEXT NOT NULL DEFAULT 'nice-to-know',
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "timesReferenced" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "KnowledgeLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KickoffTemplate" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "projectType" TEXT NOT NULL DEFAULT 'web-app',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KickoffTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditSnapshot" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "auditType" TEXT NOT NULL,
    "grade" TEXT,
    "findings" TEXT NOT NULL DEFAULT '{}',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityEvent" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER,
    "eventType" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DispatchOutcome" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectSlug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "healthAtDispatch" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "signals" TEXT NOT NULL DEFAULT '[]',
    "dispatchedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchId" TEXT,
    "goalCondition" TEXT,
    "goalAchieved" BOOLEAN,
    "goalReason" TEXT,

    CONSTRAINT "DispatchOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispatch" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "projectSlug" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "customPrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "prompt" TEXT,
    "healthAtDispatch" TEXT,
    "expectedBy" TIMESTAMP(3),
    "enqueuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "organizationId" TEXT,
    "ownerUserId" TEXT,
    "runtime" TEXT NOT NULL DEFAULT 'local',
    "runnerId" TEXT,
    "costUsd" DOUBLE PRECISION,
    "resultBranch" TEXT,
    "resultPrUrl" TEXT,

    CONSTRAINT "Dispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "activeFlow" TEXT,
    "workingMemory" TEXT NOT NULL DEFAULT '{}',
    "compressedHistory" TEXT,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" SERIAL NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "sessionId" TEXT,
    "toolCalls" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanTask" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "projectId" INTEGER,
    "projectSlug" TEXT,
    "createdBy" TEXT NOT NULL DEFAULT 'claude',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "ownerUserId" TEXT,

    CONSTRAINT "HumanTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" SERIAL NOT NULL,
    "message" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "conditionValue" TEXT NOT NULL,
    "projectSlug" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdBy" TEXT NOT NULL DEFAULT 'delamain',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "triggeredAt" TIMESTAMP(3),

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpstreamFeature" (
    "id" SERIAL NOT NULL,
    "vendor" TEXT NOT NULL DEFAULT 'anthropic',
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "integrationRecipe" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "addedBy" TEXT NOT NULL DEFAULT 'manual',
    "confidence" INTEGER NOT NULL DEFAULT 100,
    "detector" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UpstreamFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectFeatureUsage" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "featureId" INTEGER NOT NULL,
    "signal" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectFeatureUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureProposal" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "featureId" INTEGER NOT NULL,
    "diff" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "notes" TEXT,

    CONSTRAINT "FeatureProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolCallEvent" (
    "id" SERIAL NOT NULL,
    "sessionId" TEXT NOT NULL,
    "iteration" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" TEXT NOT NULL,
    "outputSize" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "resultUsed" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnthropicUsageEvent" (
    "id" SERIAL NOT NULL,
    "callSite" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "cacheReadInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreationInputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreation5mTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreation1hTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnthropicUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CascadeConfig" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "lastSeenClaudeCodeVersion" TEXT,
    "aiService" TEXT,
    "chatModel" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CascadeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),
    "anthropicKeyEnc" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brain" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "Brain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "activeOrganizationId" TEXT,
    "impersonatedBy" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" TEXT,
    "linearKeyEnc" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inviterId" TEXT NOT NULL,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_post" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" INTEGER,
    "authorUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_project_share" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" INTEGER NOT NULL,
    "sharedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_project_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerUserId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'planned',
    "targetDate" TIMESTAMP(3),
    "position" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "board_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_column" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "board_column_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "assigneeUserId" TEXT,
    "milestoneId" TEXT,
    "linearIssueId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "Project_lastActivityAt_idx" ON "Project"("lastActivityAt");

-- CreateIndex
CREATE INDEX "Project_status_lastActivityAt_idx" ON "Project"("status", "lastActivityAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_createdAt_idx" ON "ActivityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ActivityEvent_projectId_createdAt_idx" ON "ActivityEvent"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchOutcome_dispatchId_key" ON "DispatchOutcome"("dispatchId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispatch_idempotencyKey_key" ON "Dispatch"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Dispatch_projectId_status_idx" ON "Dispatch"("projectId", "status");

-- CreateIndex
CREATE INDEX "Dispatch_expectedBy_idx" ON "Dispatch"("expectedBy");

-- CreateIndex
CREATE INDEX "Dispatch_status_idx" ON "Dispatch"("status");

-- CreateIndex
CREATE INDEX "Dispatch_organizationId_idx" ON "Dispatch"("organizationId");

-- CreateIndex
CREATE INDEX "ChatSession_startedAt_idx" ON "ChatSession"("startedAt");

-- CreateIndex
CREATE INDEX "ChatSession_closedAt_idx" ON "ChatSession"("closedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_idx" ON "ChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionDate_idx" ON "ChatMessage"("sessionDate");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionDate_createdAt_idx" ON "ChatMessage"("sessionDate", "createdAt");

-- CreateIndex
CREATE INDEX "HumanTask_status_priority_createdAt_idx" ON "HumanTask"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "HumanTask_organizationId_idx" ON "HumanTask"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "UpstreamFeature_vendor_name_key" ON "UpstreamFeature"("vendor", "name");

-- CreateIndex
CREATE INDEX "ProjectFeatureUsage_projectId_idx" ON "ProjectFeatureUsage"("projectId");

-- CreateIndex
CREATE INDEX "ProjectFeatureUsage_featureId_idx" ON "ProjectFeatureUsage"("featureId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectFeatureUsage_projectId_featureId_key" ON "ProjectFeatureUsage"("projectId", "featureId");

-- CreateIndex
CREATE INDEX "FeatureProposal_projectId_idx" ON "FeatureProposal"("projectId");

-- CreateIndex
CREATE INDEX "FeatureProposal_featureId_idx" ON "FeatureProposal"("featureId");

-- CreateIndex
CREATE INDEX "FeatureProposal_status_idx" ON "FeatureProposal"("status");

-- CreateIndex
CREATE INDEX "FeatureProposal_generatedAt_idx" ON "FeatureProposal"("generatedAt");

-- CreateIndex
CREATE INDEX "ToolCallEvent_sessionId_createdAt_idx" ON "ToolCallEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ToolCallEvent_toolName_idx" ON "ToolCallEvent"("toolName");

-- CreateIndex
CREATE INDEX "ToolCallEvent_createdAt_idx" ON "ToolCallEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnthropicUsageEvent_callSite_createdAt_idx" ON "AnthropicUsageEvent"("callSite", "createdAt");

-- CreateIndex
CREATE INDEX "AnthropicUsageEvent_createdAt_idx" ON "AnthropicUsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AnthropicUsageEvent_model_idx" ON "AnthropicUsageEvent"("model");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Brain_path_key" ON "Brain"("path");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_organizationId_idx" ON "member"("organizationId");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_invite_token_key" ON "user_invite"("token");

-- CreateIndex
CREATE INDEX "user_invite_email_idx" ON "user_invite"("email");

-- CreateIndex
CREATE INDEX "org_post_organizationId_createdAt_idx" ON "org_post"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "org_project_share_organizationId_projectId_key" ON "org_project_share"("organizationId", "projectId");

-- CreateIndex
CREATE INDEX "milestone_organizationId_position_idx" ON "milestone"("organizationId", "position");

-- CreateIndex
CREATE INDEX "milestone_ownerUserId_position_idx" ON "milestone"("ownerUserId", "position");

-- CreateIndex
CREATE INDEX "board_organizationId_idx" ON "board"("organizationId");

-- CreateIndex
CREATE INDEX "board_ownerUserId_idx" ON "board"("ownerUserId");

-- CreateIndex
CREATE INDEX "board_column_boardId_position_idx" ON "board_column"("boardId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_linearIssueId_key" ON "ticket"("linearIssueId");

-- CreateIndex
CREATE INDEX "ticket_columnId_position_idx" ON "ticket"("columnId", "position");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_kickoffTemplateId_fkey" FOREIGN KEY ("kickoffTemplateId") REFERENCES "KickoffTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeLesson" ADD CONSTRAINT "KnowledgeLesson_sourceProjectId_fkey" FOREIGN KEY ("sourceProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditSnapshot" ADD CONSTRAINT "AuditSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityEvent" ADD CONSTRAINT "ActivityEvent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOutcome" ADD CONSTRAINT "DispatchOutcome_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOutcome" ADD CONSTRAINT "DispatchOutcome_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispatch" ADD CONSTRAINT "Dispatch_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTask" ADD CONSTRAINT "HumanTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTask" ADD CONSTRAINT "HumanTask_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanTask" ADD CONSTRAINT "HumanTask_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeatureUsage" ADD CONSTRAINT "ProjectFeatureUsage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectFeatureUsage" ADD CONSTRAINT "ProjectFeatureUsage_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "UpstreamFeature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureProposal" ADD CONSTRAINT "FeatureProposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureProposal" ADD CONSTRAINT "FeatureProposal_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "UpstreamFeature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_post" ADD CONSTRAINT "org_post_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_post" ADD CONSTRAINT "org_post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_post" ADD CONSTRAINT "org_post_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_project_share" ADD CONSTRAINT "org_project_share_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_project_share" ADD CONSTRAINT "org_project_share_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_column" ADD CONSTRAINT "board_column_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "board_column"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "milestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;
