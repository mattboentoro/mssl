PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_RescheduleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "requestingTeamId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedKickoffAt" DATETIME,
    "proposedVenueName" TEXT,
    "reason" TEXT NOT NULL,
    "originalKickoffAt" DATETIME,
    "originalVenueName" TEXT,
    "expectedMatchVersion" INTEGER,
    "openMatchKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_OPPONENT',
    "respondedById" TEXT,
    "responseNote" TEXT,
    "respondedAt" DATETIME,
    "adminReviewedById" TEXT,
    "adminReviewNote" TEXT,
    "adminReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescheduleRequest_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_requestingTeamId_fkey" FOREIGN KEY ("requestingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_adminReviewedById_fkey" FOREIGN KEY ("adminReviewedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_RescheduleRequest" (
    "id",
    "matchId",
    "requestingTeamId",
    "requestedById",
    "proposedKickoffAt",
    "proposedVenueName",
    "reason",
    "originalKickoffAt",
    "originalVenueName",
    "expectedMatchVersion",
    "openMatchKey",
    "status",
    "respondedById",
    "responseNote",
    "respondedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    request."id",
    request."matchId",
    request."requestingTeamId",
    request."requestedById",
    request."proposedKickoffAt",
    request."proposedVenueName",
    request."reason",
    match."kickoffAt",
    match."venueName",
    match."version",
    CASE
      WHEN request."status" IN ('PENDING', 'PENDING_OPPONENT', 'PENDING_ADMIN')
      THEN request."matchId"
      ELSE NULL
    END,
    CASE
      WHEN request."status" = 'PENDING' THEN 'PENDING_OPPONENT'
      ELSE request."status"
    END,
    request."respondedById",
    request."responseNote",
    request."respondedAt",
    request."createdAt",
    request."updatedAt"
FROM "RescheduleRequest" AS request
INNER JOIN "Match" AS match ON match."id" = request."matchId";

DROP TABLE "RescheduleRequest";
ALTER TABLE "new_RescheduleRequest" RENAME TO "RescheduleRequest";

CREATE INDEX "RescheduleRequest_matchId_status_idx"
ON "RescheduleRequest"("matchId", "status");

CREATE INDEX "RescheduleRequest_requestingTeamId_status_idx"
ON "RescheduleRequest"("requestingTeamId", "status");

CREATE INDEX "RescheduleRequest_adminReviewedById_idx"
ON "RescheduleRequest"("adminReviewedById");

CREATE UNIQUE INDEX "RescheduleRequest_openMatchKey_key"
ON "RescheduleRequest"("openMatchKey");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
