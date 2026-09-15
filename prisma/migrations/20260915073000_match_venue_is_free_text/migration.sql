-- A venue stops being a record and becomes a word on the fixture.
--
-- Organisers name pitches differently week to week ("Field 3", "Marymoor 3",
-- "Marymoor Park - Field 3"). Modelling that as a registry meant a schedule
-- import either had to reject an unrecognised pitch or quietly invent a Venue
-- row nobody asked for. Neither is what the league wants: they want the venue
-- to appear on the fixture exactly as they typed it.
--
-- So Match.venueId (a relation) becomes Match.venueName (free text), and the
-- Venue table goes away entirely.
--
-- Order matters. The names are copied onto Match *before* Venue is dropped,
-- otherwise every existing fixture would come out the other side reading "TBD".

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "homeTeamId" TEXT NOT NULL,
    "awayTeamId" TEXT NOT NULL,
    "venueName" TEXT,
    "kickoffAt" DATETIME NOT NULL,
    "matchweek" INTEGER NOT NULL,
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

-- Carry the venue's name across before the table it lives in disappears.
INSERT INTO "new_Match" ("id", "seasonId", "divisionId", "homeTeamId", "awayTeamId", "venueName", "kickoffAt", "matchweek", "status", "homeKit", "awayKit", "refereeId", "assignedAt", "version", "notes", "createdAt", "updatedAt")
SELECT
    m."id",
    m."seasonId",
    m."divisionId",
    m."homeTeamId",
    m."awayTeamId",
    (SELECT v."name" FROM "Venue" v WHERE v."id" = m."venueId"),
    m."kickoffAt",
    m."matchweek",
    m."status",
    m."homeKit",
    m."awayKit",
    m."refereeId",
    m."assignedAt",
    m."version",
    m."notes",
    m."createdAt",
    m."updatedAt"
FROM "Match" m;

DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
CREATE INDEX "Match_seasonId_idx" ON "Match"("seasonId");
CREATE INDEX "Match_divisionId_idx" ON "Match"("divisionId");
CREATE INDEX "Match_refereeId_idx" ON "Match"("refereeId");
CREATE INDEX "Match_kickoffAt_idx" ON "Match"("kickoffAt");
CREATE INDEX "Match_status_idx" ON "Match"("status");

DROP TABLE "Venue";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
