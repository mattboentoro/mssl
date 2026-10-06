-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE "new_RosterInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "freeAgentRequestId" TEXT,
    "invitedById" TEXT NOT NULL,
    "invitedUserId" TEXT,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RosterInvitation_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterInvitation_freeAgentRequestId_fkey" FOREIGN KEY ("freeAgentRequestId") REFERENCES "FreeAgentRequest" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RosterInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RosterInvitation" ("createdAt", "email", "freeAgentRequestId", "id", "invitedById", "invitedUserId", "message", "normalizedEmail", "respondedAt", "seasonId", "status", "teamId", "updatedAt") SELECT "createdAt", "email", "freeAgentRequestId", "id", "invitedById", "invitedUserId", "message", "normalizedEmail", "respondedAt", "seasonId", "status", "teamId", "updatedAt" FROM "RosterInvitation";
DROP TABLE "RosterInvitation";
ALTER TABLE "new_RosterInvitation" RENAME TO "RosterInvitation";
CREATE INDEX "RosterInvitation_seasonId_teamId_status_idx" ON "RosterInvitation"("seasonId", "teamId", "status");
CREATE INDEX "RosterInvitation_normalizedEmail_status_idx" ON "RosterInvitation"("normalizedEmail", "status");
CREATE INDEX "RosterInvitation_freeAgentRequestId_createdAt_idx" ON "RosterInvitation"("freeAgentRequestId", "createdAt");
COMMIT;
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
