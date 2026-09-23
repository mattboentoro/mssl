CREATE TABLE "RescheduleSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kickoffAt" DATETIME NOT NULL,
    "venueName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "createdById" TEXT,
    "disabledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RescheduleSlot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "RescheduleSlot_kickoffAt_venueName_key"
ON "RescheduleSlot"("kickoffAt", "venueName");

CREATE INDEX "RescheduleSlot_status_kickoffAt_idx"
ON "RescheduleSlot"("status", "kickoffAt");

CREATE INDEX "RescheduleSlot_createdById_idx"
ON "RescheduleSlot"("createdById");

ALTER TABLE "RescheduleRequest"
ADD COLUMN "slotId" TEXT REFERENCES "RescheduleSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RescheduleRequest"
ADD COLUMN "activeSlotKey" TEXT;

CREATE UNIQUE INDEX "RescheduleRequest_activeSlotKey_key"
ON "RescheduleRequest"("activeSlotKey");

CREATE INDEX "RescheduleRequest_slotId_idx"
ON "RescheduleRequest"("slotId");
