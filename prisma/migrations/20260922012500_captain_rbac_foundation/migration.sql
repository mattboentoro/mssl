-- AlterTable
ALTER TABLE "Team" ADD COLUMN "logoBlobName" TEXT;
ALTER TABLE "Team" ADD COLUMN "logoContainer" TEXT;
ALTER TABLE "Team" ADD COLUMN "logoContentType" TEXT;
ALTER TABLE "Team" ADD COLUMN "logoEtag" TEXT;
ALTER TABLE "Team" ADD COLUMN "logoUpdatedAt" DATETIME;

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entraObjectId" TEXT,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROVISIONAL',
    "claimedAt" DATETIME,
    "lastSignInAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "AppUser_entraObjectId_key" ON "AppUser"("entraObjectId");
CREATE UNIQUE INDEX "AppUser_normalizedEmail_key" ON "AppUser"("normalizedEmail");

-- CreateTable
CREATE TABLE "GlobalRoleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedById" TEXT,
    "revokedAt" DATETIME,
    CONSTRAINT "GlobalRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GlobalRoleAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "GlobalRoleAssignment_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "assignedById" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamMembership_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamMembership_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
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
    CONSTRAINT "RosterInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterInvitation_invitedUserId_fkey" FOREIGN KEY ("invitedUserId") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RosterJoinRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seasonId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decidedById" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RosterJoinRequest_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterJoinRequest_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterJoinRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RosterJoinRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "readAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RescheduleRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "requestingTeamId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposedKickoffAt" DATETIME,
    "proposedVenueName" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedById" TEXT,
    "responseNote" TEXT,
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescheduleRequest_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_requestingTeamId_fkey" FOREIGN KEY ("requestingTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RescheduleRequest_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaptainResultProposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedTeamId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "homeForfeit" BOOLEAN NOT NULL DEFAULT false,
    "awayForfeit" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_OPPONENT',
    "confirmedById" TEXT,
    "confirmedAt" DATETIME,
    "reviewedAt" DATETIME,
    "reviewNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaptainResultProposal_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaptainResultProposal_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaptainResultProposal_submittedTeamId_fkey" FOREIGN KEY ("submittedTeamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CaptainResultProposal_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScoreAppeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
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

-- CreateTable
CREATE TABLE "RefereeRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "ratedById" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RefereeRating_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeRating_refereeId_fkey" FOREIGN KEY ("refereeId") REFERENCES "Referee" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeRating_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RefereeRating_ratedById_fkey" FOREIGN KEY ("ratedById") REFERENCES "AppUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Preserve already-linked referee identities as active application users and
-- preserve captain e-mails as provisional identities awaiting Entra claim.
INSERT OR IGNORE INTO "AppUser" ("id", "entraObjectId", "email", "normalizedEmail", "displayName", "status", "claimedAt", "createdAt", "updatedAt")
SELECT 'migrated-referee-' || "id", "entraObjectId", "email", lower(trim("email")), "name", 'ACTIVE', CURRENT_TIMESTAMP, "createdAt", "updatedAt"
FROM "Referee"
WHERE "entraObjectId" IS NOT NULL AND trim("entraObjectId") <> '';

INSERT OR IGNORE INTO "AppUser" ("id", "email", "normalizedEmail", "displayName", "status", "createdAt", "updatedAt")
SELECT 'migrated-captain-' || "id", trim("email"), lower(trim("email")), "name", 'PROVISIONAL', "createdAt", "updatedAt"
FROM "TeamCaptain"
WHERE "email" IS NOT NULL AND trim("email") <> '';

INSERT OR IGNORE INTO "GlobalRoleAssignment" ("id", "userId", "role", "assignedAt")
SELECT 'migrated-referee-role-' || "id", 'migrated-referee-' || "id", 'REFEREE', CURRENT_TIMESTAMP
FROM "Referee"
WHERE "entraObjectId" IS NOT NULL AND trim("entraObjectId") <> '';

CREATE TABLE "new_TeamCaptain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "normalizedEmail" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "assignedById" TEXT,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" DATETIME,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamCaptain_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamCaptain_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeamCaptain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TeamCaptain_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TeamCaptain" ("createdAt", "email", "id", "name", "normalizedEmail", "seasonId", "sortOrder", "status", "teamId", "updatedAt", "userId")
SELECT
    tc."createdAt",
    tc."email",
    tc."id",
    tc."name",
    CASE WHEN tc."email" IS NULL OR trim(tc."email") = '' THEN NULL ELSE lower(trim(tc."email")) END,
    COALESCE(
      (SELECT s."id" FROM "Season" s WHERE s."isActive" = 1 ORDER BY s."startsOn" DESC LIMIT 1),
      (SELECT st."seasonId" FROM "SeasonTeam" st WHERE st."teamId" = tc."teamId" ORDER BY st."createdAt" DESC LIMIT 1)
    ),
    tc."sortOrder",
    'PENDING',
    tc."teamId",
    tc."updatedAt",
    (SELECT u."id" FROM "AppUser" u WHERE u."normalizedEmail" = lower(trim(tc."email")) LIMIT 1)
FROM "TeamCaptain" tc;
DROP TABLE "TeamCaptain";
ALTER TABLE "new_TeamCaptain" RENAME TO "TeamCaptain";
CREATE INDEX "TeamCaptain_teamId_idx" ON "TeamCaptain"("teamId");
CREATE INDEX "TeamCaptain_seasonId_teamId_idx" ON "TeamCaptain"("seasonId", "teamId");
CREATE INDEX "TeamCaptain_userId_idx" ON "TeamCaptain"("userId");
CREATE INDEX "TeamCaptain_normalizedEmail_idx" ON "TeamCaptain"("normalizedEmail");
CREATE UNIQUE INDEX "TeamCaptain_seasonId_teamId_sortOrder_key" ON "TeamCaptain"("seasonId", "teamId", "sortOrder");
CREATE TABLE "new_Referee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "entraObjectId" TEXT,
    "userId" TEXT,
    "phone" TEXT,
    "certification" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Referee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Referee" ("active", "certification", "createdAt", "email", "entraObjectId", "id", "name", "phone", "updatedAt", "userId")
SELECT r."active", r."certification", r."createdAt", r."email", r."entraObjectId", r."id", r."name", r."phone", r."updatedAt",
  (SELECT u."id" FROM "AppUser" u WHERE u."entraObjectId" = r."entraObjectId" LIMIT 1)
FROM "Referee" r;
DROP TABLE "Referee";
ALTER TABLE "new_Referee" RENAME TO "Referee";
CREATE UNIQUE INDEX "Referee_email_key" ON "Referee"("email");
CREATE UNIQUE INDEX "Referee_entraObjectId_key" ON "Referee"("entraObjectId");
CREATE UNIQUE INDEX "Referee_userId_key" ON "Referee"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GlobalRoleAssignment_role_idx" ON "GlobalRoleAssignment"("role");

-- CreateIndex
CREATE INDEX "GlobalRoleAssignment_assignedById_idx" ON "GlobalRoleAssignment"("assignedById");

-- CreateIndex
CREATE INDEX "GlobalRoleAssignment_revokedById_idx" ON "GlobalRoleAssignment"("revokedById");

-- CreateIndex
CREATE UNIQUE INDEX "GlobalRoleAssignment_userId_role_key" ON "GlobalRoleAssignment"("userId", "role");

-- CreateIndex
CREATE INDEX "TeamMembership_seasonId_teamId_status_idx" ON "TeamMembership"("seasonId", "teamId", "status");

-- CreateIndex
CREATE INDEX "TeamMembership_teamId_idx" ON "TeamMembership"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMembership_seasonId_userId_key" ON "TeamMembership"("seasonId", "userId");

-- CreateIndex
CREATE INDEX "RosterInvitation_seasonId_teamId_status_idx" ON "RosterInvitation"("seasonId", "teamId", "status");

-- CreateIndex
CREATE INDEX "RosterInvitation_normalizedEmail_status_idx" ON "RosterInvitation"("normalizedEmail", "status");

-- CreateIndex
CREATE INDEX "RosterJoinRequest_seasonId_teamId_status_idx" ON "RosterJoinRequest"("seasonId", "teamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "RosterJoinRequest_seasonId_teamId_requesterId_key" ON "RosterJoinRequest"("seasonId", "teamId", "requesterId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "RescheduleRequest_matchId_status_idx" ON "RescheduleRequest"("matchId", "status");

-- CreateIndex
CREATE INDEX "RescheduleRequest_requestingTeamId_status_idx" ON "RescheduleRequest"("requestingTeamId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CaptainResultProposal_matchId_key" ON "CaptainResultProposal"("matchId");

-- CreateIndex
CREATE INDEX "ScoreAppeal_status_idx" ON "ScoreAppeal"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreAppeal_matchId_teamId_key" ON "ScoreAppeal"("matchId", "teamId");

-- CreateIndex
CREATE INDEX "RefereeRating_refereeId_idx" ON "RefereeRating"("refereeId");

-- CreateIndex
CREATE UNIQUE INDEX "RefereeRating_matchId_teamId_key" ON "RefereeRating"("matchId", "teamId");
