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
      events: { select: { type: true, teamId: true } },
    },
  },
} as const;

export const MATCH_LIST_INCLUDE = {
  homeTeam: { select: { id: true, name: true, shortName: true, crestEmoji: true } },
  awayTeam: { select: { id: true, name: true, shortName: true, crestEmoji: true } },
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
        select: { id: true, name: true, divisionId: true, shortName: true, crestEmoji: true },
      },
    },
  });

  const matches = await prisma.match.findMany({
    where: { seasonId },
    select: STANDINGS_MATCH_SELECT,
  });

  const teams: StandingsTeamInput[] = divisions.flatMap((division) => division.teams);
  const byDivision = calculateStandingsByDivision(
    teams,
    matches as unknown as StandingsMatchInput[],
    standingsOptionsFromConfig(),
  );

  return divisions.map((division) => ({
    divisionId: division.id,
    divisionName: division.name,
    rows: byDivision.get(division.id) ?? [],
  }));
}

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
/* Player statistics                                                          */
/* -------------------------------------------------------------------------- */

export interface PlayerStatRow {
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  teamId: string;
  teamName: string;
  divisionName: string;
  goals: number;
  penalties: number;
  yellowCards: number;
  redCards: number;
  disciplinaryPoints: number;
  appearances: number;
}

/**
 * Top scorers and the disciplinary leaderboard, derived from the GameEvent rows
 * that referees file. Own goals are excluded from a player's goal tally.
 */
export async function getPlayerStats(seasonId: string): Promise<PlayerStatRow[]> {
  const options = standingsOptionsFromConfig();
  const countableStatuses = options.includeUnconfirmed ? ["SUBMITTED", "CONFIRMED"] : ["CONFIRMED"];

  const events = await prisma.gameEvent.findMany({
    where: {
      playerId: { not: null },
      gameReport: {
        status: { in: countableStatuses },
        match: { seasonId, status: { notIn: ["CANCELLED", "POSTPONED"] } },
      },
    },
    select: {
      type: true,
      gameReportId: true,
      player: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          jerseyNumber: true,
          team: {
            select: { id: true, name: true, division: { select: { name: true } } },
          },
        },
      },
    },
  });

  const byPlayer = new Map<string, PlayerStatRow & { reports: Set<string> }>();

  for (const event of events) {
    const player = event.player;
    if (!player) continue;

    let row = byPlayer.get(player.id);
    if (!row) {
      row = {
        playerId: player.id,
        playerName: `${player.firstName} ${player.lastName}`,
        jerseyNumber: player.jerseyNumber,
        teamId: player.team.id,
        teamName: player.team.name,
        divisionName: player.team.division.name,
        goals: 0,
        penalties: 0,
        yellowCards: 0,
        redCards: 0,
        disciplinaryPoints: 0,
        appearances: 0,
        reports: new Set<string>(),
      };
      byPlayer.set(player.id, row);
    }

    row.reports.add(event.gameReportId);

    switch (event.type) {
      case "GOAL":
        row.goals += 1;
        break;
      case "PENALTY_GOAL":
        row.goals += 1;
        row.penalties += 1;
        break;
      case "YELLOW":
        row.yellowCards += 1;
        break;
      case "RED":
        row.redCards += 1;
        break;
      default:
        break;
    }
  }

  const disciplinary = { yellow: 1, red: 3 };

  return Array.from(byPlayer.values()).map(({ reports, ...row }) => ({
    ...row,
    appearances: reports.size,
    disciplinaryPoints: row.yellowCards * disciplinary.yellow + row.redCards * disciplinary.red,
  }));
}

/* -------------------------------------------------------------------------- */
/* Teams                                                                      */
/* -------------------------------------------------------------------------- */

export async function getTeamsBySeason(seasonId: string) {
  return prisma.team.findMany({
    where: { division: { seasonId } },
    include: {
      division: { select: { id: true, name: true, slug: true } },
      _count: { select: { players: true } },
    },
    orderBy: [{ division: { sortOrder: "asc" } }, { name: "asc" }],
  });
}

export async function getTeamDetail(teamId: string) {
  return prisma.team.findUnique({
    where: { id: teamId },
    include: {
      division: { select: { id: true, name: true, seasonId: true } },
      players: {
        orderBy: [{ jerseyNumber: "asc" }, { lastName: "asc" }],
      },
    },
  });
}

export async function getTeamMatches(teamId: string) {
  return listMatches({ OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }] });
}
