-- Legacy appeals predate result snapshots. Refuse to rebuild the table if any
-- row cannot be backfilled; an INNER JOIN followed by DROP TABLE would
-- otherwise silently discard it. The TEMP table disappears with the migration
-- connection even when this CHECK aborts the migration.
CREATE TEMP TABLE "_score_appeal_migration_guard" (
    "safe" INTEGER NOT NULL CHECK ("safe" = 1)
);
INSERT INTO "_score_appeal_migration_guard" ("safe")
SELECT 0
FROM "ScoreAppeal" a
LEFT JOIN "GameReport" r ON r."matchId" = a."matchId"
WHERE r."id" IS NULL
LIMIT 1;
DROP TABLE "_score_appeal_migration_guard";

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ScoreAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "originalReportId" TEXT NOT NULL,
    "originalMatchVersion" INTEGER NOT NULL,
    "originalMatchStatus" TEXT NOT NULL,
    "originalReportUpdatedAt" DATETIME NOT NULL,
    "originalHomeScore" INTEGER NOT NULL,
    "originalAwayScore" INTEGER NOT NULL,
    "originalHomeForfeit" BOOLEAN NOT NULL,
    "originalAwayForfeit" BOOLEAN NOT NULL,
    "requestedHomeScore" INTEGER NOT NULL,
    "requestedAwayScore" INTEGER NOT NULL,
    "requestedHomeForfeit" BOOLEAN NOT NULL,
    "requestedAwayForfeit" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "openKey" TEXT,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScoreAppeal_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreAppeal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreAppeal_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ScoreAppeal_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_ScoreAppeal" (
    "id", "matchId", "teamId", "submittedById", "reason",
    "originalReportId", "originalMatchVersion", "originalMatchStatus", "originalReportUpdatedAt",
    "originalHomeScore", "originalAwayScore", "originalHomeForfeit", "originalAwayForfeit",
    "requestedHomeScore", "requestedAwayScore", "requestedHomeForfeit", "requestedAwayForfeit",
    "status", "openKey", "decidedById", "decisionNote", "decidedAt", "createdAt", "updatedAt"
)
SELECT
    a."id", a."matchId", a."teamId", a."submittedById", a."reason",
    r."id", m."version", m."status", r."updatedAt",
    r."homeScore", r."awayScore", r."homeForfeit", r."awayForfeit",
    r."homeScore", r."awayScore", r."homeForfeit", r."awayForfeit",
    a."status",
    CASE WHEN a."status" = 'PENDING' THEN r."id" || ':' || a."teamId" ELSE NULL END,
    a."decidedById", a."decisionNote", a."decidedAt", a."createdAt", a."updatedAt"
FROM "ScoreAppeal" a
JOIN "Match" m ON m."id" = a."matchId"
JOIN "GameReport" r ON r."matchId" = a."matchId";

DROP TABLE "ScoreAppeal";
ALTER TABLE "new_ScoreAppeal" RENAME TO "ScoreAppeal";

CREATE UNIQUE INDEX "ScoreAppeal_openKey_key" ON "ScoreAppeal"("openKey");
CREATE INDEX "ScoreAppeal_matchId_teamId_idx" ON "ScoreAppeal"("matchId", "teamId");
CREATE INDEX "ScoreAppeal_status_idx" ON "ScoreAppeal"("status");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
