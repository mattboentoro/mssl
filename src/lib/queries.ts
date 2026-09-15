import type { DbClient } from "@/lib/audit";
import { config } from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  calculateStandingsByDivision,
  type StandingsMatchInput,
  type StandingsOptions,
  type StandingsRow,
  type StandingsTeamInput,
} from "@/lib/standings";

/**
 * Read-side data access shared by the public pages, the referee console and the
 * admin console. Kept separate from `matches.ts` (which owns mutations) so the
 * query shapes used by the standings calculator live in exactly one place.
 */

export const standingsOptionsFromConfig = (): StandingsOptions => ({
  includeUnconfirmed: config.standings.includeUnconfirmed,
  forfeitScore: config.standings.forfeit,
});

/** Exactly the columns `calculateStandings` needs — nothing more. */
const STANDINGS_MATCH_SELECT = {
  id: true,
  divisionId: true,
  homeTeamId: true,
  awayTeamId: true,
  status: true,
  kickoffAt: true,
  report: {
    select: {
      status: true,
      homeScore: true,
      awayScore: true,
      homeForfeit: true,
      awayForfeit: true,
      discipline: { select: { type: true, teamId: true } },
    },
  },
} as const;

export const MATCH_LIST_INCLUDE = {
  homeTeam: {
    select: {
      id: true,
      name: true,
      shortName: true,
      colorPrimary: true,
      colorAlternate: true,
    },
  },
  awayTeam: {
    select: {
      id: true,
      name: true,
      shortName: true,
      colorPrimary: true,
      colorAlternate: true,
    },
  },
  division: { select: { id: true, name: true, slug: true } },
  venue: { select: { id: true, name: true, city: true } },
  referee: { select: { id: true, name: true } },
  report: {
    select: {
      id: true,
      status: true,
      homeScore: true,
      awayScore: true,
      homeForfeit: true,
      awayForfeit: true,
      submittedAt: true,
    },
  },
} as const;

export type MatchListItem = Awaited<ReturnType<typeof listMatches>>[number];

export async function listMatches(where: Record<string, unknown> = {}, take?: number) {
  return prisma.match.findMany({
    where,
    include: MATCH_LIST_INCLUDE,
    orderBy: [{ kickoffAt: "asc" }, { id: "asc" }],
    ...(take ? { take } : {}),
  });
}

export async function getSeasons() {
  return prisma.season.findMany({ orderBy: [{ startsOn: "desc" }] });
}

export async function getActiveSeason() {
  return (
    (await prisma.season.findFirst({ where: { isActive: true }, orderBy: { startsOn: "desc" } })) ??
    (await prisma.season.findFirst({ orderBy: { startsOn: "desc" } }))
  );
}

/** Resolve a season by slug or id, falling back to the active season. */
export async function resolveSeason(slugOrId?: string) {
  if (slugOrId) {
    const found = await prisma.season.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    });
    if (found) return found;
  }
  return getActiveSeason();
}

export async function getDivisions(seasonId: string) {
  return prisma.division.findMany({
    where: { seasonId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export interface DivisionStandings {
  divisionId: string;
  divisionName: string;
  rows: StandingsRow[];
}

/** The league table for every division in a season, derived only from reports. */
export async function getStandingsForSeason(seasonId: string): Promise<DivisionStandings[]> {
  const divisions = await prisma.division.findMany({
    where: { seasonId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      teams: {
        select: {
          id: true,
          name: true,
          divisionId: true,
          shortName: true,
          colorPrimary: true,
          colorAlternate: true,
        },
      },
    },
  });

  const matches = await prisma.match.findMany({
    where: { seasonId },
    select: STANDINGS_MATCH_SELECT,
  });

  // Deductions are scoped by team, and a team belongs to exactly one division
  // in one season, so filtering by the season's divisions is enough.
  const adjustments = await prisma.pointsAdjustment.findMany({
    where: { team: { division: { seasonId } } },
    select: { teamId: true, points: true, reason: true },
  });

  const teams: StandingsTeamInput[] = divisions.flatMap((division) => division.teams);
  const byDivision = calculateStandingsByDivision(
    teams,
    matches as unknown as StandingsMatchInput[],
    { ...standingsOptionsFromConfig(), adjustments },
  );

  return divisions.map((division) => ({
    divisionId: division.id,
    divisionName: division.name,
    rows: byDivision.get(division.id) ?? [],
  }));
}

/** Every administrative points adjustment in a season, newest first. */
export async function getPointsAdjustments(seasonId: string) {
  return prisma.pointsAdjustment.findMany({
    where: { team: { division: { seasonId } } },
    orderBy: { createdAt: "desc" },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          shortName: true,
          division: { select: { id: true, name: true } },
        },
      },
    },
  });
}

export type PointsAdjustmentRow = Awaited<ReturnType<typeof getPointsAdjustments>>[number];

export async function getUpcomingMatches(seasonId: string, take = 5) {
  return listMatches(
    {
      seasonId,
      kickoffAt: { gte: new Date() },
      status: { notIn: ["CANCELLED"] },
    },
    take,
  );
}

export async function getRecentResults(seasonId: string, take = 5) {
  return prisma.match.findMany({
    where: { seasonId, report: { isNot: null } },
    include: MATCH_LIST_INCLUDE,
    orderBy: [{ kickoffAt: "desc" }],
    take,
  });
}

export async function getAnnouncements(take = 6) {
  return prisma.announcement.findMany({
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take,
  });
}

export async function getDocuments() {
  return prisma.document.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
}

/* -------------------------------------------------------------------------- */
/* Discipline                                                                 */
/* -------------------------------------------------------------------------- */

export interface DisciplinaryRow {
  id: string;
  playerName: string;
  type: string;
  minute: number | null;
  note: string | null;
  issuedBy: string;
  createdAt: Date;
  teamId: string;
  teamName: string;
  divisionName: string;
  matchId: string | null;
  matchLabel: string | null;
}

/**
 * Every disciplinary record in a season: cards filed by referees on game
 * reports, plus league sanctions added in Game Administration.
 */
export async function getDisciplinaryRecords(seasonId: string): Promise<DisciplinaryRow[]> {
  const rows = await prisma.disciplinaryAction.findMany({
    where: { seasonId },
    orderBy: [{ createdAt: "desc" }],
    include: {
      team: { select: { id: true, name: true, division: { select: { name: true } } } },
      match: {
        select: {
          id: true,
          matchweek: true,
          homeTeam: { select: { shortName: true } },
          awayTeam: { select: { shortName: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    playerName: row.playerName,
    type: row.type,
    minute: row.minute,
    note: row.note,
    issuedBy: row.issuedBy,
    createdAt: row.createdAt,
    teamId: row.team.id,
    teamName: row.team.name,
    divisionName: row.team.division.name,
    matchId: row.match?.id ?? null,
    matchLabel: row.match
      ? `MW${row.match.matchweek} ${row.match.homeTeam.shortName} v ${row.match.awayTeam.shortName}`
      : null,
  }));
}

/** Card counts per team, used by the public discipline summary. */
export async function getTeamDisciplineTotals(seasonId: string) {
  const grouped = await prisma.disciplinaryAction.groupBy({
    by: ["teamId", "type"],
    where: { seasonId },
    _count: { _all: true },
  });

  const totals = new Map<string, { yellow: number; red: number }>();
  for (const row of grouped) {
    const entry = totals.get(row.teamId) ?? { yellow: 0, red: 0 };
    if (row.type === "YELLOW") entry.yellow += row._count._all;
    if (row.type === "RED") entry.red += row._count._all;
    totals.set(row.teamId, entry);
  }
  return totals;
}

export interface WarningBoardEntry {
  playerName: string;
  teamId: string;
  teamName: string;
  yellow: number;
  red: number;
  /** Yellow = 1, red = 3. Drives the ordering and the severity tone. */
  points: number;
  /** Notes from league sanctions an admin issued against this player. */
  sanctions: { id: string; type: string; note: string | null; createdAt: Date }[];
}

/**
 * The pre-match warning board: every player on either team who is carrying a
 * card in this season, worst first. Shown to the referee who has the fixture so
 * they walk onto the pitch knowing who is already in the book, and so league
 * sanctions added by an administrator reach the referee who needs them.
 *
 * Takes an explicit client (like `src/lib/matches.ts`) so it is directly
 * testable against the test database.
 */
export async function getWarningBoard(
  db: DbClient,
  seasonId: string,
  teamIds: string[],
): Promise<WarningBoardEntry[]> {
  if (teamIds.length === 0) return [];

  const rows = await db.disciplinaryAction.findMany({
    where: { seasonId, teamId: { in: teamIds } },
    orderBy: { createdAt: "desc" },
    include: { team: { select: { id: true, name: true } } },
  });

  const byPlayer = new Map<string, WarningBoardEntry>();
  for (const row of rows) {
    // Free-text names, so fold case and whitespace before grouping.
    const key = `${row.teamId}::${row.playerName.trim().toLowerCase()}`;
    const entry = byPlayer.get(key) ?? {
      playerName: row.playerName.trim(),
      teamId: row.team.id,
      teamName: row.team.name,
      yellow: 0,
      red: 0,
      points: 0,
      sanctions: [],
    };
    if (row.type === "RED") {
      entry.red += 1;
      entry.points += 3;
    } else {
      entry.yellow += 1;
      entry.points += 1;
    }
    if (row.issuedBy === "ADMIN") {
      entry.sanctions.push({
        id: row.id,
        type: row.type,
        note: row.note,
        createdAt: row.createdAt,
      });
    }
    byPlayer.set(key, entry);
  }

  return [...byPlayer.values()].sort(
    (a, b) =>
      b.sanctions.length - a.sanctions.length ||
      b.points - a.points ||
      b.red - a.red ||
      a.playerName.localeCompare(b.playerName),
  );
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                      */
/* -------------------------------------------------------------------------- */

export async function getTeamsBySeason(seasonId: string) {
  return prisma.team.findMany({
    where: { division: { seasonId } },
    include: { division: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ division: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

export async function getTeamDetail(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: { division: { select: { id: true, name: true, seasonId: true } } },
  });
}

export async function getTeamMatches(teamId: string) {
  return listMatches({ OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] });
}
