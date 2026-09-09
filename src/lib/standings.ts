import type { GameEventType, GameReportStatus, MatchStatus } from "@/lib/enums";

/**
 * Standings calculator.
 *
 * This module is deliberately pure: it takes plain data in and returns plain
 * data out, with no Prisma, no `process.env` and no I/O. The league table is
 * therefore *always* derived from game reports and can never be hand-edited.
 */

export interface StandingsEventInput {
  type: GameEventType | string;
  /** Team the event is charged to (for cards) / credited to (for goals). */
  teamId: string;
}

export interface StandingsReportInput {
  status: GameReportStatus | string;
  homeScore: number;
  awayScore: number;
  homeForfeit: boolean;
  awayForfeit: boolean;
  events?: StandingsEventInput[];
}

export interface StandingsMatchInput {
  id: string;
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string;
  status: MatchStatus | string;
  kickoffAt: Date | string;
  report?: StandingsReportInput | null;
}

export interface StandingsTeamInput {
  id: string;
  name: string;
  divisionId: string;
  shortName?: string;
  crestEmoji?: string;
}

export type FormResult = "W" | "D" | "L";

export interface StandingsRow {
  teamId: string;
  teamName: string;
  shortName: string;
  crestEmoji: string;
  divisionId: string;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  /** Most recent first, capped at `formLength`. */
  form: FormResult[];
  yellowCards: number;
  redCards: number;
  disciplinaryPoints: number;
  /** Which tiebreaker separated this row from the one above it, if any. */
  separatedBy?: Tiebreaker;
}

export type Tiebreaker =
  "points" | "goalDifference" | "goalsFor" | "headToHead" | "disciplinaryPoints" | "alphabetical";

export interface StandingsOptions {
  /** Count reports that are SUBMITTED but not yet admin-CONFIRMED. */
  includeUnconfirmed?: boolean;
  /** Scoreline awarded when a team forfeits. */
  forfeitScore?: { winner: number; loser: number };
  pointsForWin?: number;
  pointsForDraw?: number;
  pointsForLoss?: number;
  /** Disciplinary points used by the final tiebreaker. */
  disciplinary?: { yellow: number; red: number };
  formLength?: number;
}

export const DEFAULT_STANDINGS_OPTIONS: Required<StandingsOptions> = {
  includeUnconfirmed: true,
  forfeitScore: { winner: 3, loser: 0 },
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  disciplinary: { yellow: 1, red: 3 },
  formLength: 5,
};

/** Statuses whose fixture never contributes to the table. */
const NON_COUNTING_MATCH_STATUSES = new Set<string>(["CANCELLED", "POSTPONED"]);

export interface EffectiveResult {
  homeGoals: number;
  awayGoals: number;
  /** Both sides failed to field a team: nobody scores, both take a loss. */
  doubleForfeit: boolean;
  byForfeit: boolean;
}

/**
 * Decide whether a match counts and what its effective scoreline is.
 * Returns `null` when the match should be ignored by the table.
 */
export function resolveResult(
  match: StandingsMatchInput,
  options: Required<StandingsOptions>,
): EffectiveResult | null {
  if (NON_COUNTING_MATCH_STATUSES.has(String(match.status))) return null;

  const report = match.report;
  if (!report) return null;

  const status = String(report.status);
  if (status === "DISPUTED") return null;
  if (status !== "CONFIRMED" && !(options.includeUnconfirmed && status === "SUBMITTED")) {
    return null;
  }

  const { winner, loser } = options.forfeitScore;

  if (report.homeForfeit && report.awayForfeit) {
    return { homeGoals: loser, awayGoals: loser, doubleForfeit: true, byForfeit: true };
  }
  if (report.homeForfeit) {
    return { homeGoals: loser, awayGoals: winner, doubleForfeit: false, byForfeit: true };
  }
  if (report.awayForfeit) {
    return { homeGoals: winner, awayGoals: loser, doubleForfeit: false, byForfeit: true };
  }

  return {
    homeGoals: Math.max(0, Math.trunc(report.homeScore)),
    awayGoals: Math.max(0, Math.trunc(report.awayScore)),
    doubleForfeit: false,
    byForfeit: false,
  };
}

interface Accumulator extends Omit<StandingsRow, "rank" | "form" | "separatedBy"> {
  /** Oldest first while accumulating; reversed and trimmed at the end. */
  formTimeline: { at: number; result: FormResult }[];
}

const toTime = (value: Date | string): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

/**
 * Build the league table for a set of teams from their matches' game reports.
 *
 * Teams with no completed matches are still returned (all zeroes) so a division
 * page shows the full field from matchweek one.
 */
export function calculateStandings(
  teams: StandingsTeamInput[],
  matches: StandingsMatchInput[],
  options: StandingsOptions = {},
): StandingsRow[] {
  const opts: Required<StandingsOptions> = {
    ...DEFAULT_STANDINGS_OPTIONS,
    ...options,
    forfeitScore: options.forfeitScore ?? DEFAULT_STANDINGS_OPTIONS.forfeitScore,
    disciplinary: options.disciplinary ?? DEFAULT_STANDINGS_OPTIONS.disciplinary,
  };

  const table = new Map<string, Accumulator>();
  for (const team of teams) {
    table.set(team.id, {
      teamId: team.id,
      teamName: team.name,
      shortName: team.shortName ?? team.name,
      crestEmoji: team.crestEmoji ?? "\u26BD",
      divisionId: team.divisionId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      yellowCards: 0,
      redCards: 0,
      disciplinaryPoints: 0,
      formTimeline: [],
    });
  }

  /** Head-to-head ledger: `${teamId}|${opponentId}` -> aggregate. */
  const h2h = new Map<string, { points: number; gf: number; ga: number }>();
  const bumpH2h = (teamId: string, opponentId: string, points: number, gf: number, ga: number) => {
    const key = `${teamId}|${opponentId}`;
    const entry = h2h.get(key) ?? { points: 0, gf: 0, ga: 0 };
    entry.points += points;
    entry.gf += gf;
    entry.ga += ga;
    h2h.set(key, entry);
  };

  const ordered = [...matches].sort((a, b) => toTime(a.kickoffAt) - toTime(b.kickoffAt));

  for (const match of ordered) {
    const home = table.get(match.homeTeamId);
    const away = table.get(match.awayTeamId);
    if (!home || !away) continue; // team outside the requested set (e.g. other division)

    // Cards count even when the result itself is disputed? No: a table row must
    // be derivable from the same reports that produce the result, so cards are
    // only counted for matches that count.
    const result = resolveResult(match, opts);
    if (!result) continue;

    const kickoff = toTime(match.kickoffAt);

    for (const event of match.report?.events ?? []) {
      const target = table.get(event.teamId);
      if (!target) continue;
      if (event.type === "YELLOW") {
        target.yellowCards += 1;
        target.disciplinaryPoints += opts.disciplinary.yellow;
      } else if (event.type === "RED") {
        target.redCards += 1;
        target.disciplinaryPoints += opts.disciplinary.red;
      }
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += result.homeGoals;
    home.goalsAgainst += result.awayGoals;
    away.goalsFor += result.awayGoals;
    away.goalsAgainst += result.homeGoals;

    let homePoints: number;
    let awayPoints: number;
    let homeForm: FormResult;
    let awayForm: FormResult;

    if (result.doubleForfeit) {
      home.lost += 1;
      away.lost += 1;
      homePoints = opts.pointsForLoss;
      awayPoints = opts.pointsForLoss;
      homeForm = "L";
      awayForm = "L";
    } else if (result.homeGoals > result.awayGoals) {
      home.won += 1;
      away.lost += 1;
      homePoints = opts.pointsForWin;
      awayPoints = opts.pointsForLoss;
      homeForm = "W";
      awayForm = "L";
    } else if (result.homeGoals < result.awayGoals) {
      away.won += 1;
      home.lost += 1;
      homePoints = opts.pointsForLoss;
      awayPoints = opts.pointsForWin;
      homeForm = "L";
      awayForm = "W";
    } else {
      home.drawn += 1;
      away.drawn += 1;
      homePoints = opts.pointsForDraw;
      awayPoints = opts.pointsForDraw;
      homeForm = "D";
      awayForm = "D";
    }

    home.points += homePoints;
    away.points += awayPoints;
    home.formTimeline.push({ at: kickoff, result: homeForm });
    away.formTimeline.push({ at: kickoff, result: awayForm });

    bumpH2h(home.teamId, away.teamId, homePoints, result.homeGoals, result.awayGoals);
    bumpH2h(away.teamId, home.teamId, awayPoints, result.awayGoals, result.homeGoals);
  }

  for (const row of table.values()) {
    row.goalDifference = row.goalsFor - row.goalsAgainst;
  }

  const rows = [...table.values()];

  // Stage 1: points -> goal difference -> goals for.
  rows.sort(comparePrimary);

  // Stage 2: within each block that is level on all three, apply head-to-head,
  // then disciplinary points, then alphabetical order for stability.
  const result: StandingsRow[] = [];
  let index = 0;
  while (index < rows.length) {
    let end = index + 1;
    while (end < rows.length && comparePrimary(rows[index], rows[end]) === 0) end += 1;

    const block = rows.slice(index, end);
    if (block.length > 1) {
      const members = new Set(block.map((r) => r.teamId));
      block.sort((a, b) => {
        const h2hDiff = compareHeadToHead(a, b, members, h2h);
        if (h2hDiff !== 0) return h2hDiff;
        if (a.disciplinaryPoints !== b.disciplinaryPoints) {
          return a.disciplinaryPoints - b.disciplinaryPoints;
        }
        return a.teamName.localeCompare(b.teamName);
      });
    }

    for (const row of block) {
      result.push(finalise(row, result.length + 1, opts.formLength));
    }
    index = end;
  }

  for (let i = 1; i < result.length; i += 1) {
    result[i].separatedBy = whichTiebreaker(result[i - 1], result[i], rows, h2h);
  }

  return result;
}

function comparePrimary(
  a: Pick<StandingsRow, "points" | "goalDifference" | "goalsFor">,
  b: Pick<StandingsRow, "points" | "goalDifference" | "goalsFor">,
): number {
  if (a.points !== b.points) return b.points - a.points;
  if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
  if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

/**
 * Mini-league between the tied teams only: points, then goal difference, then
 * goals scored in those meetings. Returns 0 when they have not met (or the
 * mini-league is itself level).
 */
function compareHeadToHead(
  a: { teamId: string },
  b: { teamId: string },
  members: Set<string>,
  h2h: Map<string, { points: number; gf: number; ga: number }>,
): number {
  const aggregate = (teamId: string) => {
    let points = 0;
    let gf = 0;
    let ga = 0;
    for (const opponentId of members) {
      if (opponentId === teamId) continue;
      const entry = h2h.get(`${teamId}|${opponentId}`);
      if (!entry) continue;
      points += entry.points;
      gf += entry.gf;
      ga += entry.ga;
    }
    return { points, gf, ga };
  };

  const left = aggregate(a.teamId);
  const right = aggregate(b.teamId);
  if (left.points !== right.points) return right.points - left.points;
  const leftGd = left.gf - left.ga;
  const rightGd = right.gf - right.ga;
  if (leftGd !== rightGd) return rightGd - leftGd;
  if (left.gf !== right.gf) return right.gf - left.gf;
  return 0;
}

function whichTiebreaker(
  above: StandingsRow,
  below: StandingsRow,
  allRows: { teamId: string }[],
  h2h: Map<string, { points: number; gf: number; ga: number }>,
): Tiebreaker {
  if (above.points !== below.points) return "points";
  if (above.goalDifference !== below.goalDifference) return "goalDifference";
  if (above.goalsFor !== below.goalsFor) return "goalsFor";
  const pair = new Set([above.teamId, below.teamId]);
  void allRows;
  if (compareHeadToHead(above, below, pair, h2h) !== 0) return "headToHead";
  if (above.disciplinaryPoints !== below.disciplinaryPoints) return "disciplinaryPoints";
  return "alphabetical";
}

function finalise(row: Accumulator, rank: number, formLength: number): StandingsRow {
  const { formTimeline, ...rest } = row;
  const form = formTimeline
    .slice()
    .sort((a, b) => a.at - b.at)
    .slice(-formLength)
    .reverse()
    .map((entry) => entry.result);
  return { ...rest, rank, form };
}

/** Convenience wrapper: build a table per division. */
export function calculateStandingsByDivision(
  teams: StandingsTeamInput[],
  matches: StandingsMatchInput[],
  options: StandingsOptions = {},
): Map<string, StandingsRow[]> {
  const byDivision = new Map<string, StandingsRow[]>();
  const divisionIds = [...new Set(teams.map((t) => t.divisionId))];
  for (const divisionId of divisionIds) {
    byDivision.set(
      divisionId,
      calculateStandings(
        teams.filter((t) => t.divisionId === divisionId),
        matches.filter((m) => m.divisionId === divisionId),
        options,
      ),
    );
  }
  return byDivision;
}
