import type { DbClient } from "@/lib/audit";
import { config } from "@/lib/config";
import type { SuspensionReason } from "@/lib/enums";
import { prisma } from "@/lib/prisma";
import { getSeasonDivisionMap } from "@/lib/season-teams";
import { resolveSuspensions, type ResolvedSuspension, type TeamFixture } from "@/lib/suspensions";
import {
  calculateStandingsByDivision,
  forfeitScoreline,
  type PrimaryMetric,
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

/** The bits of a report that decide what scoreline a fixture shows. */
type ScoredReport = {
  homeScore: number;
  awayScore: number;
  homeForfeit: boolean;
  awayForfeit: boolean;
};

/**
 * The scoreline to print for a fixture: the awarded one when a side forfeited,
 * otherwise the one the referee reported.
 *
 * A forfeit is a ruling rather than a result, and referees file it against a
 * 0-0. Printing that 0-0 would contradict the standings, which count the
 * awarded score — so every fixture list runs the report through here first.
 */
export function displayedScore(
  report: ScoredReport | null | undefined,
): { home: number; away: number } | null {
  if (!report) return null;
  const awarded = forfeitScoreline(report, config.standings.forfeit);
  return awarded
    ? { home: awarded.homeGoals, away: awarded.awayGoals }
    : { home: report.homeScore, away: report.awayScore };
}

/** `displayedScore` written out, e.g. "3–0", or `null` when no report exists. */
export function scoreText(report: ScoredReport | null | undefined): string | null {
  const score = displayedScore(report);
  return score ? `${score.home}\u2013${score.away}` : null;
}

/** Exactly the columns `calculateStandings` needs — nothing more. */
const STANDINGS_MATCH_SELECT = {
  id: true,
  divisionId: true,
  homeTeamId: true,
  awayTeamId: true,
  status: true,
  kickoffAt: true,
  // Must be selected: the calculator skips a fixture that is flagged out of the
  // table, and the caller casts this shape, so a missing column fails silently.
  countsForStandings: true,
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
      slug: true,
      name: true,
      shortName: true,
      colorPrimary: true,
      colorAlternate: true,
    },
  },
  awayTeam: {
    select: {
      id: true,
      slug: true,
      name: true,
      shortName: true,
      colorPrimary: true,
      colorAlternate: true,
    },
  },
  division: { select: { id: true, name: true, slug: true } },
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

/** Every division in the league. Divisions are not season-scoped. */
export async function getDivisions() {
  return prisma.division.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export interface DivisionStandings {
  divisionId: string;
  divisionName: string;
  rows: StandingsRow[];
  /** How the season ranks teams. Drives whether the table shows a PPG column. */
  primaryMetric: PrimaryMetric;
}

/** The league table for every division in a season, derived only from reports. */
export async function getStandingsForSeason(seasonId: string): Promise<DivisionStandings[]> {
  const divisions = await prisma.division.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      teams: {
        select: {
          id: true,
          slug: true,
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

  // Deductions name their season outright. Teams outlive seasons, so a
  // deduction served in one season must not follow the club into the next.
  const adjustments = await prisma.pointsAdjustment.findMany({
    where: { seasonId },
    select: { teamId: true, points: true, reason: true },
  });

  // A club is bucketed into the division it played in *that season*, not the
  // one it sits in today -- otherwise promoting a side would retroactively move
  // its old results up a tier. See src/lib/season-teams.ts.
  const seasonDivisions = await getSeasonDivisionMap(seasonId);
  const teams: StandingsTeamInput[] = divisions
    .flatMap((division) => division.teams)
    .map((team) => ({
      ...team,
      divisionId: seasonDivisions.get(team.id) ?? team.divisionId,
    }));
  // The season owns its ranking rule, so every table for that season -- public,
  // admin, mini-snippet -- agrees without the caller having to remember.
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { tiebreakerMode: true },
  });
  const primaryMetric: PrimaryMetric =
    season?.tiebreakerMode === "POINTS_PER_GAME" ? "pointsPerGame" : "points";
  const byDivision = calculateStandingsByDivision(
    teams,
    matches as unknown as StandingsMatchInput[],
    {
      ...standingsOptionsFromConfig(),
      adjustments,
      primaryMetric,
    },
  );

  return divisions.map((division) => ({
    divisionId: division.id,
    divisionName: division.name,
    rows: byDivision.get(division.id) ?? [],
    primaryMetric,
  }));
}

/** Every administrative points adjustment in a season, newest first. */
export async function getPointsAdjustments(seasonId: string) {
  return prisma.pointsAdjustment.findMany({
    where: { seasonId },
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
  /** Ban length in fixtures. Null means a red card nobody has reviewed yet. */
  gamesSuspended: number | null;
  suspensionReason: string | null;
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
    gamesSuspended: row.gamesSuspended,
    suspensionReason: row.suspensionReason,
  }));
}

export interface SuspensionRow extends ResolvedSuspension {
  teamName: string;
  /** Fixtures the ban covers that have yet to be played, earliest first. */
  upcoming: { id: string; label: string; kickoffAt: Date }[];
}

/**
 * Every ban in a season, mapped onto the fixtures it covers.
 *
 * Bans are not stored against fixtures — they are worked out here from the card
 * and the schedule, so moving a fixture moves the ban with it and a rescinded
 * card takes its ban away without anything left to clean up.
 */
export async function getSeasonSuspensions(seasonId: string): Promise<SuspensionRow[]> {
  const [records, matches] = await Promise.all([
    prisma.disciplinaryAction.findMany({
      where: { seasonId, gamesSuspended: { gt: 0 } },
      include: {
        team: { select: { id: true, name: true } },
        match: { select: { kickoffAt: true } },
      },
    }),
    prisma.match.findMany({
      where: { seasonId },
      select: {
        id: true,
        kickoffAt: true,
        status: true,
        matchweek: true,
        homeTeamId: true,
        awayTeamId: true,
        homeTeam: { select: { shortName: true } },
        awayTeam: { select: { shortName: true } },
        report: { select: { id: true } },
      },
    }),
  ]);

  if (records.length === 0) return [];

  const labels = new Map<string, { label: string; kickoffAt: Date }>();
  const fixturesByTeam = new Map<string, TeamFixture[]>();
  for (const match of matches) {
    labels.set(match.id, {
      label: `MW${match.matchweek} ${match.homeTeam.shortName} v ${match.awayTeam.shortName}`,
      kickoffAt: match.kickoffAt,
    });
    const fixture: TeamFixture = {
      id: match.id,
      kickoffAt: match.kickoffAt,
      // A fixture nobody played cannot be sat out, so a ban steps over it.
      eligible: match.status !== "CANCELLED" && match.status !== "POSTPONED",
      played: match.report !== null || match.status === "FORFEIT",
    };
    for (const teamId of [match.homeTeamId, match.awayTeamId]) {
      const bucket = fixturesByTeam.get(teamId);
      if (bucket) bucket.push(fixture);
      else fixturesByTeam.set(teamId, [fixture]);
    }
  }

  const teamNames = new Map(records.map((row) => [row.team.id, row.team.name]));
  const resolved = resolveSuspensions(
    records.map((row) => ({
      id: row.id,
      teamId: row.teamId,
      playerName: row.playerName.trim(),
      games: row.gamesSuspended ?? 0,
      reason: (row.suspensionReason ?? "LEAGUE_SANCTION") as SuspensionReason,
      originKickoffAt: row.match?.kickoffAt ?? null,
      createdAt: row.createdAt,
    })),
    fixturesByTeam,
  );

  return resolved.map((suspension) => {
    // Only the fixtures still to be sat out are worth naming; the rest are
    // history the moment a result is filed against them.
    const upcoming: { id: string; label: string; kickoffAt: Date }[] = [];
    for (const id of suspension.matchIds.slice(suspension.served)) {
      const fixture = labels.get(id);
      if (fixture) upcoming.push({ id, label: fixture.label, kickoffAt: fixture.kickoffAt });
    }
    return {
      ...suspension,
      teamName: teamNames.get(suspension.teamId) ?? "Unknown",
      upcoming,
    };
  });
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

/** Every team in the league, ordered by division. Teams are not season-scoped. */
export async function getTeams() {
  return prisma.team.findMany({
    include: {
      division: { select: { id: true, name: true, slug: true } },
      captains: { orderBy: { sortOrder: "asc" } },
    },
    orderBy: [{ division: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

/**
 * A team by its public slug (`/teams/arsenal`).
 *
 * Also accepts the row id so older links, audit-log references and anything
 * holding a cuid keep resolving.
 */
export async function getTeamDetail(slugOrId: string) {
  return prisma.team.findFirst({
    where: { OR: [{ slug: slugOrId }, { id: slugOrId }] },
    include: {
      division: { select: { id: true, name: true } },
      captains: { orderBy: { sortOrder: "asc" } },
    },
  });
}

export async function getTeamMatches(teamId: string) {
  return listMatches({ OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] });
}

/**
 * Split a club's fixture list into results and fixtures still to come.
 *
 * "Upcoming" means the kickoff is genuinely ahead of us: a past date with no
 * report is a missing report, not something to look forward to. `now` is a
 * parameter so the split stays pure — components must not read the clock
 * themselves (the `react-hooks/purity` lint rule enforces this).
 */
export function splitTeamMatches<T extends { kickoffAt: Date; status: string; report: unknown }>(
  matches: T[],
  now: Date = new Date(),
): { played: T[]; upcoming: T[] } {
  const cutoff = now.getTime();
  return {
    played: matches.filter((m) => m.report),
    upcoming: matches.filter(
      (m) => !m.report && m.status !== "CANCELLED" && m.kickoffAt.getTime() >= cutoff,
    ),
  };
}
