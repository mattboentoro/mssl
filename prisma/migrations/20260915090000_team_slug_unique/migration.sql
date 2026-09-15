-- A club's public address is now league-wide, not per-division:
-- /teams/arsenal must name exactly one club.
DROP INDEX "Team_divisionId_slug_key";

CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");