import type { Prisma, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Per-season division membership: promotion and relegation.
 *
 * A club's division is a fact about a *season*, not a standing fact about the
 * club. `Team.divisionId` records where a club plays today; `SeasonTeam`
 * records where it played in a given season. Reading the former where the
 * latter is meant is how a league table quietly rewrites its own history --
 * promote a side and last season's table shows it in the tier above, holding
 * results it won in the tier below.
 *
 * The rule everywhere is the same, and lives in `resolveDivisionId` below:
 * an explicit entry wins, and the club's present-day division is the fallback
 * for seasons that pre-date anyone thinking about this.
 */

/** Anything that can run a query: the client, or a transaction handle. */
type Db = PrismaClient | Prisma.TransactionClient;

/** A club's division for one season, keyed by team id. */
export type SeasonDivisionMap = ReadonlyMap<string, string>;

/**
 * Pick the division a club counts as being in.
 *
 * Pure, so the precedence rule is testable without a database.
 *
 * @param explicit Division recorded against this season, if any.
 * @param home The club's present-day division (`Team.divisionId`).
 */
export function resolveDivisionId(explicit: string | null | undefined, home: string): string {
  return explicit ?? home;
}

/**
 * Build the season's division map from raw rows.
 *
 * Split out from the query so the fallback behaviour can be tested directly.
 */
export function buildSeasonDivisionMap(
  teams: readonly { id: string; divisionId: string }[],
  entries: readonly { teamId: string; divisionId: string }[],
): SeasonDivisionMap {
  const explicit = new Map(entries.map((e) => [e.teamId, e.divisionId]));
  return new Map(teams.map((t) => [t.id, resolveDivisionId(explicit.get(t.id), t.divisionId)]));
}

/** Which division every club counted as being in for `seasonId`. */
export async function getSeasonDivisionMap(
  seasonId: string,
  db: Db = prisma,
): Promise<SeasonDivisionMap> {
  const [teams, entries] = await Promise.all([
    db.team.findMany({ select: { id: true, divisionId: true } }),
    db.seasonTeam.findMany({ where: { seasonId }, select: { teamId: true, divisionId: true } }),
  ]);
  return buildSeasonDivisionMap(teams, entries);
}

/**
 * Pin a club's current division into every season that has no entry yet.
 *
 * Copy-on-write. Called immediately *before* a club is moved, so seasons that
 * have already been played keep the division the club actually played in. If
 * this ran after the move -- or not at all -- the fallback would resolve those
 * seasons to the club's new division and the history would be wrong.
 *
 * Done in application code rather than as a data migration so it stays portable
 * across SQLite and PostgreSQL.
 */
export async function pinSeasonDivisions(db: Db, teamId: string): Promise<number> {
  const team = await db.team.findUnique({ where: { id: teamId }, select: { divisionId: true } });
  if (!team) return 0;

  const [seasons, existing] = await Promise.all([
    db.season.findMany({ select: { id: true } }),
    db.seasonTeam.findMany({ where: { teamId }, select: { seasonId: true } }),
  ]);

  const pinned = new Set(existing.map((e) => e.seasonId));
  const missing = seasons.filter((s) => !pinned.has(s.id));
  if (missing.length === 0) return 0;

  await db.seasonTeam.createMany({
    data: missing.map((s) => ({
      seasonId: s.id,
      teamId,
      divisionId: team.divisionId,
    })),
  });
  return missing.length;
}

/**
 * Move a club into `divisionId` for one season.
 *
 * Pins every other season first, so only the named season moves.
 */
export async function setSeasonDivision(
  db: Db,
  { seasonId, teamId, divisionId }: { seasonId: string; teamId: string; divisionId: string },
): Promise<void> {
  await pinSeasonDivisions(db, teamId);
  await db.seasonTeam.upsert({
    where: { seasonId_teamId: { seasonId, teamId } },
    create: { seasonId, teamId, divisionId },
    update: { divisionId },
  });
}
