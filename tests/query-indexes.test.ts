import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const migration = "20261005213000_query_indexes";
const correction = "20261005220000_roster_invitation_update_cascade";
const prismaDirectory = path.join(process.cwd(), "prisma");
const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
const indexes = [
  ["Match", ["seasonId", "kickoffAt", "id"]],
  ["Match", ["seasonId", "divisionId", "kickoffAt", "id"]],
  ["Match", ["homeTeamId", "kickoffAt"]],
  ["Match", ["awayTeamId", "kickoffAt"]],
  ["DisciplinaryAction", ["seasonId", "createdAt", "id"]],
  ["DisciplinaryAction", ["seasonId", "teamId", "createdAt", "id"]],
  ["RescheduleRequest", ["status", "createdAt"]],
  ["CaptainResultProposal", ["status", "createdAt"]],
  ["ScoreAppeal", ["status", "createdAt"]],
  ["AuditLog", ["entity", "createdAt"]],
] as const;
const removed = ["Match_seasonId_idx", "DisciplinaryAction_seasonId_idx", "ScoreAppeal_status_idx"];

let directory: string;
let db: PrismaClient;
let before: Record<string, unknown[]>;
let tablesBefore: { name: string; sql: string }[];
let tablesAfterIndexes: { name: string; sql: string }[];
let invitationIndexesBefore: Awaited<ReturnType<typeof invitationIndexes>>;
let beforePlans: string[][];
let queries: { sql: string; parameters: (string | Date)[] }[];
let historicalSeasonId: string;

function databaseUrl(database = "existing.db") {
  return `file:${path.join(directory, database)}`;
}

function cli(args: string[], database = "existing.db") {
  return execFileSync(process.execPath, [prismaCli, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl(database),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function deploy(database?: string) {
  cli(["migrate", "deploy", "--schema", path.join(directory, "schema.prisma")], database);
}

function assertNoDrift(database = "existing.db") {
  cli(
    [
      "migrate",
      "diff",
      "--from-url",
      databaseUrl(database),
      "--to-schema-datamodel",
      path.join(directory, "schema.prisma"),
      "--exit-code",
    ],
    database,
  );
}

async function invitationIndexes() {
  const definitions = await db.$queryRawUnsafe<{ name: string; unique: number }[]>(
    `PRAGMA index_list("RosterInvitation")`,
  );
  return Promise.all(
    definitions
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async ({ name, unique }) => ({
        name,
        unique,
        columns: (await db.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${name}")`)).map(
          ({ name }) => name,
        ),
      })),
  );
}

async function snapshot(client: PrismaClient) {
  const tables = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'
     ORDER BY name`,
  );
  return Object.fromEntries(
    await Promise.all(
      tables.map(async ({ name }) => [
        name,
        await client.$queryRawUnsafe(`SELECT * FROM "${name}" ORDER BY rowid`),
      ]),
    ),
  );
}

async function explain(query: (typeof queries)[number]) {
  const rows = await db.$queryRawUnsafe<{ detail: string }[]>(
    `EXPLAIN QUERY PLAN ${query.sql}`,
    ...query.parameters,
  );
  return rows.map(({ detail }) => detail);
}

async function assertIndexes(client: PrismaClient) {
  const schema = fs.readFileSync(path.join(prismaDirectory, "schema.prisma"), "utf8");
  const definitions = await client.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'index'`,
  );
  for (const [table, columns] of indexes) {
    const model = schema.match(new RegExp(`model ${table} \\{[\\s\\S]*?\\n\\}`))?.[0];
    expect(model).toContain(`@@index([${columns.join(", ")}])`);
    const name = `${table}_${columns.join("_")}_idx`;
    const fields = await client.$queryRawUnsafe<{ name: string }[]>(`PRAGMA index_info("${name}")`);
    expect(fields.map(({ name }) => name)).toEqual([...columns]);
  }
  for (const name of removed) expect(definitions).not.toContainEqual({ name });
}

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(prismaDirectory, "query-index-test-"));
  fs.copyFileSync(
    path.join(prismaDirectory, "schema.prisma"),
    path.join(directory, "schema.prisma"),
  );
  const migrations = path.join(directory, "migrations");
  fs.mkdirSync(migrations);
  for (const name of fs.readdirSync(path.join(prismaDirectory, "migrations"))) {
    if (name === "migration_lock.toml" || name < migration) {
      fs.cpSync(path.join(prismaDirectory, "migrations", name), path.join(migrations, name), {
        recursive: true,
      });
    }
  }
  deploy();
  const datasourceUrl = databaseUrl();
  // Seed only this isolated, already-migrated legacy database, never the developer's DB.
  execFileSync(
    process.execPath,
    [path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs"), "prisma/seed.ts"],
    { env: { ...process.env, DATABASE_URL: datasourceUrl }, stdio: "pipe" },
  );
  db = new PrismaClient({ datasourceUrl });
  const match = await db.match.findFirstOrThrow({
    where: { season: { isActive: false }, report: { isNot: null } },
    include: { report: true },
  });
  historicalSeasonId = match.seasonId;
  const user = await db.appUser.findFirstOrThrow();
  const freeAgent = await db.freeAgentRequest.findFirstOrThrow();
  await db.rosterInvitation.createMany({
    data: [
      {
        id: "index-linked-invitation",
        seasonId: match.seasonId,
        teamId: match.homeTeamId,
        invitedById: user.id,
        invitedUserId: user.id,
        freeAgentRequestId: freeAgent.id,
        email: freeAgent.submittedByEmail,
        normalizedEmail: freeAgent.submittedByEmail.toLowerCase(),
        message: "Preserve linked request and user",
      },
      {
        id: "index-unlinked-invitation",
        seasonId: match.seasonId,
        teamId: match.homeTeamId,
        invitedById: user.id,
        email: "unlinked@example.test",
        normalizedEmail: "unlinked@example.test",
        status: "DECLINED",
        respondedAt: match.kickoffAt,
      },
    ],
  });
  await db.match.createMany({
    data: Array.from({ length: 160 }, (_, index) => ({
      id: `index-match-${String(index).padStart(3, "0")}`,
      seasonId: match.seasonId,
      divisionId: match.divisionId,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      kickoffAt: match.kickoffAt,
      matchweek: "Index test",
    })),
  });
  await db.disciplinaryAction.createMany({
    data: Array.from({ length: 160 }, (_, index) => ({
      id: `index-card-${String(index).padStart(3, "0")}`,
      seasonId: match.seasonId,
      teamId: match.homeTeamId,
      playerName: "Index test",
      type: "YELLOW",
      createdAt: match.kickoffAt,
    })),
  });
  await db.rescheduleRequest.create({
    data: {
      matchId: match.id,
      requestingTeamId: match.homeTeamId,
      requestedById: user.id,
      reason: "Index migration fixture",
      status: "PENDING_ADMIN",
    },
  });
  await db.captainResultProposal.create({
    data: {
      matchId: match.id,
      submittedTeamId: match.homeTeamId,
      submittedById: user.id,
      homeScore: 1,
      awayScore: 0,
      status: "PENDING_ADMIN",
    },
  });
  const report = match.report;
  if (!report) throw new Error("The seeded fixture needs a report");
  await db.scoreAppeal.create({
    data: {
      matchId: match.id,
      teamId: match.homeTeamId,
      submittedById: user.id,
      reason: "Index migration fixture",
      originalReportId: report.id,
      originalMatchVersion: match.version,
      originalMatchStatus: match.status,
      originalReportUpdatedAt: report.updatedAt,
      originalHomeScore: report.homeScore,
      originalAwayScore: report.awayScore,
      originalHomeForfeit: report.homeForfeit,
      originalAwayForfeit: report.awayForfeit,
      requestedHomeScore: 1,
      requestedAwayScore: 0,
      requestedHomeForfeit: false,
      requestedAwayForfeit: false,
    },
  });
  await db.auditLog.create({
    data: { entity: "Match", entityId: match.id, action: "INDEX_TEST" },
  });
  const cutoff = new Date("2020-01-01");
  queries = [
    {
      sql: `SELECT * FROM "Match" WHERE "seasonId" = ? AND "kickoffAt" >= ?
            ORDER BY "kickoffAt", "id" LIMIT 100 OFFSET 100`,
      parameters: [match.seasonId, cutoff],
    },
    {
      sql: `SELECT * FROM "Match" WHERE "seasonId" = ? AND "divisionId" = ? AND "kickoffAt" >= ?
            ORDER BY "kickoffAt", "id" LIMIT 100 OFFSET 100`,
      parameters: [match.seasonId, match.divisionId, cutoff],
    },
    ...["homeTeamId", "awayTeamId"].map((field) => ({
      sql: `SELECT * FROM "Match" WHERE "${field}" = ? AND "kickoffAt" >= ? ORDER BY "kickoffAt"`,
      parameters: [match.homeTeamId, cutoff],
    })),
    {
      sql: `SELECT * FROM "DisciplinaryAction" WHERE "seasonId" = ?
            ORDER BY "createdAt" DESC, "id" DESC LIMIT 100 OFFSET 100`,
      parameters: [match.seasonId],
    },
    {
      sql: `SELECT * FROM "DisciplinaryAction" WHERE "seasonId" = ? AND "teamId" = ?
            ORDER BY "createdAt" DESC, "id" DESC LIMIT 20`,
      parameters: [match.seasonId, match.homeTeamId],
    },
    ...["RescheduleRequest", "CaptainResultProposal", "ScoreAppeal"].map((table) => ({
      sql: `SELECT * FROM "${table}" WHERE "status" = ? ORDER BY "createdAt"`,
      parameters: [table === "ScoreAppeal" ? "PENDING" : "PENDING_ADMIN"],
    })),
    {
      sql: `SELECT * FROM "AuditLog" WHERE "entity" = ? ORDER BY "createdAt" DESC LIMIT 50 OFFSET 50`,
      parameters: ["Match"],
    },
  ];
  before = await snapshot(db);
  invitationIndexesBefore = await invitationIndexes();
  tablesBefore = await db.$queryRawUnsafe(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  beforePlans = await Promise.all(queries.map(explain));
  fs.cpSync(path.join(prismaDirectory, "migrations", migration), path.join(migrations, migration), {
    recursive: true,
  });
  await db.$disconnect();
  deploy();
  db = new PrismaClient({ datasourceUrl });
  tablesAfterIndexes = await db.$queryRawUnsafe(
    `SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  await db.$disconnect();
  fs.cpSync(
    path.join(prismaDirectory, "migrations", correction),
    path.join(migrations, correction),
    { recursive: true },
  );
  deploy();
  db = new PrismaClient({ datasourceUrl });
}, 120_000);

afterAll(async () => {
  await db?.$disconnect();
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});

describe("database readiness migrations", () => {
  it("preserves every seeded row and foreign key while replacing only redundant prefixes", async () => {
    expect(before.Match.length).toBeGreaterThan(100);
    expect(before.Season.length).toBeGreaterThan(1);
    expect(await snapshot(db)).toEqual(before);
    expect(await db.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    expect(await db.$queryRawUnsafe("PRAGMA integrity_check")).toEqual([{ integrity_check: "ok" }]);
    await assertIndexes(db);
    expect(tablesAfterIndexes).toEqual(tablesBefore);
    expect(await invitationIndexes()).toEqual(invitationIndexesBefore);
    assertNoDrift();
  });

  it("applies the full migration history to an empty database", async () => {
    deploy("fresh.db");
    const fresh = new PrismaClient({
      datasourceUrl: databaseUrl("fresh.db"),
    });
    try {
      await assertIndexes(fresh);
      expect(await fresh.match.count()).toBe(0);
      expect(await fresh.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
      assertNoDrift("fresh.db");
    } finally {
      await fresh.$disconnect();
    }
  });

  it("keeps 100-row historical fixture pages stable across tied kickoff times", async () => {
    const args = {
      where: { seasonId: historicalSeasonId },
      orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
      select: { id: true },
    } satisfies Prisma.MatchFindManyArgs;
    const all = await db.match.findMany(args);
    const first = await db.match.findMany({ ...args, take: 100, skip: 0 });
    const second = await db.match.findMany({ ...args, take: 100, skip: 100 });
    expect(first).toHaveLength(100);
    expect(second).toHaveLength(100);
    expect([...first, ...second]).toEqual(all.slice(0, 200));
    expect(new Set([...first, ...second].map(({ id }) => id)).size).toBe(200);
  });

  it("uses both team/date indexes for a team fixture OR query (the merged result still sorts)", async () => {
    const [team, cutoff] = queries[2].parameters;
    const plan = await explain({
      sql: `SELECT * FROM "Match" WHERE ("homeTeamId" = ? OR "awayTeamId" = ?) AND "kickoffAt" >= ?
              ORDER BY "kickoffAt", "id"`,
      parameters: [team, team, cutoff],
    });
    expect(plan.join("\n")).toContain("Match_homeTeamId_kickoffAt_idx");
    expect(plan.join("\n")).toContain("Match_awayTeamId_kickoffAt_idx");
  });

  it("cascades request ID changes and preserves invitations when requests are deleted", async () => {
    const existing = await db.rosterInvitation.findUniqueOrThrow({
      where: { id: "index-linked-invitation" },
    });
    const request = await db.freeAgentRequest.create({
      data: {
        submittedByName: "Foreign key probe",
        submittedByEmail: "index-fk-probe@example.test",
        yearsExperience: 1,
        preferredPosition: "ANY",
      },
    });
    const invitation = await db.rosterInvitation.create({
      data: {
        seasonId: existing.seasonId,
        teamId: existing.teamId,
        invitedById: existing.invitedById,
        freeAgentRequestId: request.id,
        email: request.submittedByEmail,
        normalizedEmail: request.submittedByEmail,
      },
    });
    const updatedId = `${request.id}-updated`;
    await db.$executeRaw`UPDATE "FreeAgentRequest" SET "id" = ${updatedId} WHERE "id" = ${request.id}`;
    expect(
      await db.rosterInvitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).toMatchObject({ freeAgentRequestId: updatedId });
    await db.$executeRaw`DELETE FROM "FreeAgentRequest" WHERE "id" = ${updatedId}`;
    expect(
      await db.rosterInvitation.findUniqueOrThrow({ where: { id: invitation.id } }),
    ).toMatchObject({ freeAgentRequestId: null });
    expect(await db.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    await db.rosterInvitation.delete({ where: { id: invitation.id } });
  });

  it.each(
    indexes.map(([table, columns], index) => [`${table}_${columns.join("_")}_idx`, index] as const),
  )(
    "uses %s for the corresponding equality/range and ordering query without a sort",
    async (name, index) => {
      const plan = await explain(queries[index]);
      expect(beforePlans[index].join("\n")).not.toContain(name);
      if (index !== 2 && index !== 3) {
        expect(beforePlans[index].join("\n")).toContain("TEMP B-TREE");
      }
      expect(plan.join("\n")).toContain(`USING INDEX ${name}`);
      expect(plan.join("\n")).toContain("SEARCH");
      expect(plan.join("\n")).not.toContain("TEMP B-TREE");
    },
  );
});
