-- Divisions (and therefore teams) stop belonging to a season.
--
-- A league's structure is a standing fact; a season is only the window of
-- fixtures played inside it. Deleting a season used to cascade through
-- Division -> Team and wipe every club on the site, which is what this
-- migration exists to stop.
--
-- Order matters. PointsAdjustment is backfilled *first*, while Division still
-- carries seasonId to derive it from. Only then is Division rebuilt.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- 1. PointsAdjustment gains an explicit season.
--
-- It used to infer one by walking team -> division -> season. Once teams
-- outlive seasons that walk is meaningless, so a deduction has to say which
-- season it applies to or it would follow a club forever.
CREATE TABLE "new_PointsAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdByEmail" TEXT,
    "createdByName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PointsAdjustment_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PointsAdjustment_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_PointsAdjustment" ("id", "seasonId", "teamId", "points", "reason", "createdByEmail", "createdByName", "createdAt")
SELECT
    p."id",
    (SELECT d."seasonId" FROM "Team" t JOIN "Division" d ON d."id" = t."divisionId" WHERE t."id" = p."teamId"),
    p."teamId",
    p."points",
    p."reason",
    p."createdByEmail",
    p."createdByName",
    p."createdAt"
FROM "PointsAdjustment" p
-- An adjustment whose team or division has already gone cannot name a season,
-- and the column is NOT NULL. Such a row is unreachable anyway.
WHERE (SELECT d."seasonId" FROM "Team" t JOIN "Division" d ON d."id" = t."divisionId" WHERE t."id" = p."teamId") IS NOT NULL;

DROP TABLE "PointsAdjustment";
ALTER TABLE "new_PointsAdjustment" RENAME TO "PointsAdjustment";
CREATE INDEX "PointsAdjustment_teamId_idx" ON "PointsAdjustment"("teamId");
CREATE INDEX "PointsAdjustment_seasonId_idx" ON "PointsAdjustment"("seasonId");

-- 2. Collapse the per-season copies of each division onto one canonical row.
--
-- Slugs used to be unique per season, so "Premier League" existed once per
-- season. They are globally unique now, so the copies have to merge: keep the
-- oldest row for each slug and repoint its teams and fixtures at it.
--
-- If two seasons each hold a team with the same slug in the same division, the
-- repoint below trips Team's (divisionId, slug) unique index and this migration
-- aborts rather than silently merging two different clubs. Re-seed in that case.
CREATE TEMPORARY TABLE "_division_merge" AS
SELECT
    d."id" AS "oldId",
    (SELECT k."id" FROM "Division" k WHERE k."slug" = d."slug" ORDER BY k."createdAt" ASC, k."id" ASC LIMIT 1) AS "newId"
FROM "Division" d;

UPDATE "Team"
   SET "divisionId" = (SELECT m."newId" FROM "_division_merge" m WHERE m."oldId" = "Team"."divisionId")
 WHERE "divisionId" IN (SELECT "oldId" FROM "_division_merge" WHERE "oldId" <> "newId");

UPDATE "Match"
   SET "divisionId" = (SELECT m."newId" FROM "_division_merge" m WHERE m."oldId" = "Match"."divisionId")
 WHERE "divisionId" IN (SELECT "oldId" FROM "_division_merge" WHERE "oldId" <> "newId");

DELETE FROM "Division" WHERE "id" NOT IN (SELECT "newId" FROM "_division_merge");

DROP TABLE "_division_merge";

-- 3. Drop Division.seasonId and make the slug globally unique.
CREATE TABLE "new_Division" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Division" ("createdAt", "id", "name", "slug", "sortOrder", "updatedAt") SELECT "createdAt", "id", "name", "slug", "sortOrder", "updatedAt" FROM "Division";
DROP TABLE "Division";
ALTER TABLE "new_Division" RENAME TO "Division";
CREATE UNIQUE INDEX "Division_slug_key" ON "Division"("slug");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
