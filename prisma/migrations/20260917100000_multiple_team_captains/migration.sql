-- CreateTable
CREATE TABLE "TeamCaptain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeamCaptain_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve every existing captain before removing the legacy team columns.
INSERT INTO "TeamCaptain" ("id", "teamId", "name", "email", "sortOrder", "createdAt", "updatedAt")
SELECT
    'migrated-' || "id",
    "id",
    trim("captainName"),
    NULLIF(trim("contactEmail"), ''),
    0,
    "createdAt",
    "updatedAt"
FROM "Team"
WHERE "captainName" IS NOT NULL AND trim("captainName") <> '';

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "divisionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "colorPrimary" TEXT NOT NULL DEFAULT '#0f766e',
    "colorAlternate" TEXT NOT NULL DEFAULT '#ffffff',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "Division" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Team" ("colorAlternate", "colorPrimary", "createdAt", "divisionId", "id", "name", "shortName", "slug", "updatedAt")
SELECT "colorAlternate", "colorPrimary", "createdAt", "divisionId", "id", "name", "shortName", "slug", "updatedAt" FROM "Team";
DROP TABLE "Team";
ALTER TABLE "new_Team" RENAME TO "Team";
CREATE UNIQUE INDEX "Team_slug_key" ON "Team"("slug");
CREATE INDEX "Team_divisionId_idx" ON "Team"("divisionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "TeamCaptain_teamId_idx" ON "TeamCaptain"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamCaptain_teamId_sortOrder_key" ON "TeamCaptain"("teamId", "sortOrder");
