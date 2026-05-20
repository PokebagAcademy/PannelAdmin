-- CreateTable
CREATE TABLE "GithubAppInstallation" (
    "id" TEXT NOT NULL,
    "installationId" BIGINT NOT NULL,
    "orgLogin" TEXT NOT NULL,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "installedById" TEXT,

    CONSTRAINT "GithubAppInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepoLink" (
    "id" TEXT NOT NULL,
    "machineId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'main',
    "deployPath" TEXT NOT NULL DEFAULT 'mods',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepoLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GithubAppInstallation_installationId_key" ON "GithubAppInstallation"("installationId");

-- CreateIndex
CREATE UNIQUE INDEX "GithubAppInstallation_orgLogin_key" ON "GithubAppInstallation"("orgLogin");

-- CreateIndex
CREATE UNIQUE INDEX "RepoLink_machineId_owner_repo_key" ON "RepoLink"("machineId", "owner", "repo");

-- AddForeignKey
ALTER TABLE "RepoLink" ADD CONSTRAINT "RepoLink_machineId_fkey" FOREIGN KEY ("machineId") REFERENCES "Machine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
