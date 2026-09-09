/*
  Warnings:

  - You are about to drop the `GameEvent` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Player` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `lockedAt` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `lockedById` on the `Match` table. All the data in the column will be lost.
  - You are about to drop the column `lockedByName` on the `Match` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "GameEvent_playerId_idx";

-- DropIndex
DROP INDEX "GameEvent_teamId_idx";

-- DropIndex
DROP INDEX "GameEvent_gameReportId_idx";

-- DropIndex
DROP INDEX "Player_teamId_idx";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "GameEvent";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Player";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "DisciplinaryAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "gameReportId" TEXT,
    "matchId" TEXT,
    "playerName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "minute" INTEGER,
    "note" TEXT,
    "issuedBy" TEXT NOT NULL DEFAULT 'REFEREE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DisciplinaryAction_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisciplinaryAction_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisciplinaryAction_gameReportId_fkey" FOREIGN KEY ("gameReportId") REFERENCES "GameReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DisciplinaryAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "venueId" TEXT,
    "kickoffAt" DATETIME NOT NULL,
    "matchweek" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
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
    CONSTRAINT "Match_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Match_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("assignedAt", "awayTeamId", "createdAt", "divisionId", "homeTeamId", "id", "kickoffAt", "matchweek", "notes", "refereeId", "seasonId", "status", "updatedAt", "venueId", "version") SELECT "assignedAt", "awayTeamId", "createdAt", "divisionId", "homeTeamId", "id", "kickoffAt", "matchweek", "notes", "refereeId", "seasonId", "status", "updatedAt", "venueId", "version" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_seasonId_idx" ON "Match"("seasonId");
CREATE INDEX "Match_divisionId_idx" ON "Match"("divisionId");
CREATE INDEX "Match_refereeId_idx" ON "Match"("refereeId");
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");
CREATE INDEX "Match_status_idx" ON "Match"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DisciplinaryAction_seasonId_idx" ON "DisciplinaryAction"("seasonId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_teamId_idx" ON "DisciplinaryAction"("teamId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_gameReportId_idx" ON "DisciplinaryAction"("gameReportId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_matchId_idx" ON "DisciplinaryAction"("matchId");
