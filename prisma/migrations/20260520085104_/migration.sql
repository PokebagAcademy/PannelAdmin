/*
  Warnings:

  - You are about to drop the column `anthropicKeyEnc` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `anthropicKeyIv` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `anthropicKeyTag` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `ChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PendingToolCall` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "ChatMessage" DROP CONSTRAINT "ChatMessage_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "ChatSession" DROP CONSTRAINT "ChatSession_userId_fkey";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "anthropicKeyEnc",
DROP COLUMN "anthropicKeyIv",
DROP COLUMN "anthropicKeyTag";

-- DropTable
DROP TABLE "ChatMessage";

-- DropTable
DROP TABLE "ChatSession";

-- DropTable
DROP TABLE "PendingToolCall";

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "redirectUris" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpAuthCode" (
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "codeChallengeMethod" TEXT NOT NULL DEFAULT 'S256',
    "scope" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "McpAuthCode_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "McpToken" (
    "token" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "McpToken_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "McpToken_userId_idx" ON "McpToken"("userId");

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpAuthCode" ADD CONSTRAINT "McpAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("clientId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpToken" ADD CONSTRAINT "McpToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
