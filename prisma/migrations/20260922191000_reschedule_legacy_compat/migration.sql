ALTER TABLE "RescheduleRequest"
ADD COLUMN "legacySlotExempt" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RescheduleRequest"
SET "legacySlotExempt" = true
WHERE "status" IN ('PENDING_OPPONENT', 'PENDING_ADMIN')
  AND "slotId" IS NULL;
