-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'complete',
ADD COLUMN     "usageIn" INTEGER,
ADD COLUMN     "usageOut" INTEGER;

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN     "machineId" TEXT,
ADD COLUMN     "model" TEXT NOT NULL DEFAULT 'claude-opus-4-7',
ADD COLUMN     "repoName" TEXT,
ADD COLUMN     "repoOwner" TEXT,
ADD COLUMN     "shared" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PendingToolCall" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "toolUseId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolInput" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PendingToolCall_sessionId_createdAt_idx" ON "PendingToolCall"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PendingToolCall_toolUseId_key" ON "PendingToolCall"("toolUseId");

-- CreateIndex
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");
