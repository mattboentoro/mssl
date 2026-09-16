-- Per-season division membership, so promotion and relegation stop rewriting
-- history. `Team.divisionId` stays as the club's present-day division and is
-- the fallback for any season without an explicit entry here.
CREATE TABLE "SeasonTeam" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "divisionId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SeasonTeam_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeasonTeam_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SeasonTeam_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SeasonTeam_seasonId_teamId_key" ON "SeasonTeam"("seasonId", "teamId");
CREATE INDEX "SeasonTeam_seasonId_divisionId_idx" ON "SeasonTeam"("seasonId", "divisionId");
CREATE INDEX "SeasonTeam_teamId_idx" ON "SeasonTeam"("teamId");
CREATE INDEX "SeasonTeam_divisionId_idx" ON "SeasonTeam"("divisionId");
