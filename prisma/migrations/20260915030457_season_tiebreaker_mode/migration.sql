-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Season" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "startsOn" DATETIME NOT NULL,
    "endsOn" DATETIME NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "tiebreakerMode" TEXT NOT NULL DEFAULT 'POINTS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Season" ("createdAt", "endsOn", "id", "isActive", "name", "slug", "startsOn", "updatedAt") SELECT "createdAt", "endsOn", "id", "isActive", "name", "slug", "startsOn", "updatedAt" FROM "Season";
DROP TABLE "Season";
ALTER TABLE "new_Season" RENAME TO "Season";
CREATE UNIQUE INDEX "Season_slug_key" ON "Season"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
