import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const databasePath = path.join(process.cwd(), "prisma", "score-appeal-migration-test.db");
const datasourceUrl = "file:./score-appeal-migration-test.db";
const migrationPath = path.join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260922030000_score_appeal_details",
  "migration.sql",
);

function removeDatabase() {
  for (const suffix of ["", "-journal", "-shm", "-wal"]) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

async function createLegacyDatabase(db: PrismaClient, withReport: boolean) {
  await db.$executeRawUnsafe(`
    CREATE TABLE "Match" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "version" INTEGER NOT NULL DEFAULT 0,
      "status" TEXT NOT NULL
    )
  `);
  await db.$executeRawUnsafe(`
    CREATE TABLE "GameReport" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "matchId" TEXT NOT NULL UNIQUE,
      "homeScore" INTEGER NOT NULL,
      "awayScore" INTEGER NOT NULL,
      "homeForfeit" BOOLEAN NOT NULL DEFAULT false,
      "awayForfeit" BOOLEAN NOT NULL DEFAULT false,
      "updatedAt" DATETIME NOT NULL
    )
  `);
  await db.$executeRawUnsafe(`
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
      UNIQUE ("matchId", "teamId")
    )
  `);
  await db.$executeRawUnsafe(
    `INSERT INTO "Match" ("id", "version", "status") VALUES ('match-1', 4, 'CONFIRMED')`,
  );
  if (withReport) {
    await db.$executeRawUnsafe(`
      INSERT INTO "GameReport"
        ("id", "matchId", "homeScore", "awayScore", "homeForfeit", "awayForfeit", "updatedAt")
      VALUES
        ('report-1', 'match-1', 3, 2, false, false, '2026-01-02T03:04:05.000Z')
    `);
  }
  await db.$executeRawUnsafe(`
    INSERT INTO "ScoreAppeal"
      ("id", "matchId", "teamId", "submittedById", "reason", "status", "createdAt", "updatedAt")
    VALUES
      ('appeal-1', 'match-1', 'team-1', 'user-1', 'Legacy reason', 'PENDING',
       '2026-01-03T00:00:00.000Z', '2026-01-03T00:00:00.000Z')
  `);
}

function migrationStatements() {
  return fs
    .readFileSync(migrationPath, "utf8")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function runMigration(db: PrismaClient) {
  for (const statement of migrationStatements()) {
    await db.$executeRawUnsafe(statement);
  }
}

beforeEach(removeDatabase);
afterEach(removeDatabase);

describe("score appeal snapshot migration", () => {
  it("aborts before dropping a legacy appeal that has no report", async () => {
    const db = new PrismaClient({ datasourceUrl });
    try {
      await createLegacyDatabase(db, false);
      await expect(runMigration(db)).rejects.toThrow();

      const appeals = await db.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "ScoreAppeal"`,
      );
      expect(appeals).toEqual([{ id: "appeal-1" }]);
      const replacementTables = await db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" = 'new_ScoreAppeal'`,
      );
      expect(replacementTables).toEqual([]);
    } finally {
      await db.$disconnect();
    }
  });

  it("backfills every legacy appeal when its report exists", async () => {
    const db = new PrismaClient({ datasourceUrl });
    try {
      await createLegacyDatabase(db, true);
      await runMigration(db);

      const appeals = await db.$queryRawUnsafe<
        Array<{
          id: string;
          originalReportId: string;
          originalMatchVersion: bigint;
          originalHomeScore: bigint;
          requestedHomeScore: bigint;
          openKey: string;
        }>
      >(
        `SELECT "id", "originalReportId", "originalMatchVersion", "originalHomeScore",
                "requestedHomeScore", "openKey" FROM "ScoreAppeal"`,
      );
      expect(appeals).toHaveLength(1);
      expect(appeals[0]).toMatchObject({
        id: "appeal-1",
        originalReportId: "report-1",
        originalMatchVersion: 4,
        originalHomeScore: 3,
        requestedHomeScore: 3,
        openKey: "report-1:team-1",
      });
    } finally {
      await db.$disconnect();
    }
  });
});
