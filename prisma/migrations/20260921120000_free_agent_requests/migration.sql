-- CreateTable
CREATE TABLE "FreeAgentRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "submittedById" TEXT,
    "submittedByName" TEXT NOT NULL,
    "submittedByEmail" TEXT NOT NULL,
    "phone" TEXT,
    "yearsExperience" INTEGER NOT NULL,
    "preferredPosition" TEXT NOT NULL,
    "preferredDivisionId" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" DATETIME,
    "reviewedByEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FreeAgentRequest_preferredDivisionId_fkey" FOREIGN KEY ("preferredDivisionId") REFERENCES "Division" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "FreeAgentRequest_submittedByEmail_key" ON "FreeAgentRequest"("submittedByEmail");

-- CreateIndex
CREATE INDEX "FreeAgentRequest_status_idx" ON "FreeAgentRequest"("status");

-- CreateIndex
CREATE INDEX "FreeAgentRequest_createdAt_idx" ON "FreeAgentRequest"("createdAt");

-- CreateIndex
CREATE INDEX "FreeAgentRequest_preferredDivisionId_idx" ON "FreeAgentRequest"("preferredDivisionId");
