ALTER TABLE "RosterInvitation"
ADD COLUMN "freeAgentRequestId" TEXT
REFERENCES "FreeAgentRequest"("id") ON DELETE SET NULL;

UPDATE "RosterInvitation"
SET "freeAgentRequestId" = (
  SELECT "id"
  FROM "FreeAgentRequest"
  WHERE lower("FreeAgentRequest"."submittedByEmail") = "RosterInvitation"."normalizedEmail"
)
WHERE "freeAgentRequestId" IS NULL;

CREATE INDEX "RosterInvitation_freeAgentRequestId_createdAt_idx"
ON "RosterInvitation"("freeAgentRequestId", "createdAt");

UPDATE "FreeAgentRequest"
SET "status" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "RosterInvitation"
    WHERE "RosterInvitation"."freeAgentRequestId" = "FreeAgentRequest"."id"
  ) THEN 'CONTACTED'
  ELSE 'PENDING'
END;
