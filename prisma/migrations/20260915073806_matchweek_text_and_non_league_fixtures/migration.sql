-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_GameReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "refereeId" TEXT,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "homeForfeit" BOOLEAN NOT NULL DEFAULT false,
    "awayForfeit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "incidentReport" TEXT,
    "misconduct" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" DATETIME,
    "confirmedById" TEXT,
    "disputeReason" TEXT,
    "overrideReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameReport_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GameReport_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_GameReport" ("awayForfeit", "awayScore", "confirmedAt", "confirmedById", "createdAt", "disputeReason", "homeForfeit", "homeScore", "id", "incidentReport", "matchId", "misconduct", "notes", "overrideReason", "refereeId", "status", "submittedAt", "updatedAt") SELECT "awayForfeit", "awayScore", "confirmedAt", "confirmedById", "createdAt", "disputeReason", "homeForfeit", "homeScore", "id", "incidentReport", "matchId", "misconduct", "notes", "overrideReason", "refereeId", "status", "submittedAt", "updatedAt" FROM "GameReport";
DROP TABLE "GameReport";
ALTER TABLE "new_GameReport" RENAME TO "GameReport";
CREATE UNIQUE INDEX "GameReport_matchId_key" ON "GameReport"("matchId");
CREATE INDEX "GameReport_refereeId_idx" ON "GameReport"("refereeId");
CREATE INDEX "GameReport_status_idx" ON "GameReport"("status");
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "venueName" TEXT,
    "kickoffAt" DATETIME NOT NULL,
    "matchweek" TEXT NOT NULL,
    "countsForStandings" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "homeKit" TEXT NOT NULL DEFAULT 'PRIMARY',
    "awayKit" TEXT NOT NULL DEFAULT 'ALTERNATE',
    "refereeId" TEXT,
    "assignedAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Match_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("assignedAt", "awayKit", "awayTeamId", "createdAt", "divisionId", "homeKit", "homeTeamId", "id", "kickoffAt", "matchweek", "notes", "refereeId", "seasonId", "status", "updatedAt", "venueName", "version") SELECT "assignedAt", "awayKit", "awayTeamId", "createdAt", "divisionId", "homeKit", "homeTeamId", "id", "kickoffAt", "matchweek", "notes", "refereeId", "seasonId", "status", "updatedAt", "venueName", "version" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_seasonId_idx" ON "Match"("seasonId");
CREATE INDEX "Match_divisionId_idx" ON "Match"("divisionId");
CREATE INDEX "Match_refereeId_idx" ON "Match"("refereeId");
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");
CREATE INDEX "Match_status_idx" ON "Match"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
