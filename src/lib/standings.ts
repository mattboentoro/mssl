import type { CardType, GameReportStatus, MatchStatus } from "@/lib/enums";
import { DEFAULT_ALTERNATE, DEFAULT_PRIMARY } from "@/lib/kits";

/**
 * Standings calculator.
 *
 * This module is deliberately pure: it takes plain data in and returns plain
 * data out, with no Prisma, no `process.env` and no I/O. The league table is
 * therefore *always* derived from game reports and can never be hand-edited.
 */

export interface StandingsCardInput {
  type: CardType | string;
  /** Team the card is charged to. */
  teamId: string;
}

export interface StandingsReportInput {
  status: GameReportStatus | string;
  homeScore: number;
  awayScore: number;
  homeForfeit: boolean;
  awayForfeit: boolean;
  /** Cards filed on this report, used by the disciplinary tiebreaker. */
  discipline?: StandingsCardInput[];
}

export interface StandingsMatchInput {
  id: string;
  divisionId: string;
  homeTeamId: string;
  awayTeamId: string;
  status: MatchStatus | string;
  kickoffAt: Date | string;
  /**
   * Defaults to true. A final, play-off or friendly is set false and is then
   * invisible to the table — no points, no played, no goals, no cards.
   */
  countsForStandings?: boolean;
  report?: StandingsReportInput | null;
}

export interface StandingsTeamInput {
  id: string;
  name: string;
  divisionId: string;
  /** Public URL segment. Falls back to the id so tests can omit it. */
  slug?: string;
  shortName?: string;
  colorPrimary?: string | null;
  colorAlternate?: string | null;
}

export type FormResult = "W" | "D" | "L";

export interface StandingsRow {
  teamId: string;
  teamSlug: string;
  teamName: string;
  shortName: string;
  colorPrimary: string;
  colorAlternate: string;
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
  /**
   * Net administrative points applied to this team, normally negative.
   * `points` already includes it; this field exists so the table can show it.
   */
  pointsAdjustment: number;
  /** Which tiebreaker separated this row from the one above it, if any. */
  separatedBy?: Tiebreaker;
}

export type Tiebreaker =
  | "points"
  | "pointsPerGame"
  | "goalDifference"
  | "goalsFor"
  | "headToHead"
  | "disciplinaryPoints"
  | "alphabetical";

/**
 * What the table is primarily ranked on. `points` is the normal league rule;
 * `pointsPerGame` keeps a table fair while teams have played an unequal number
 * of fixtures, which matters in a workplace league where games get rearranged.
 */
export type PrimaryMetric = "points" | "pointsPerGame";

/**
 * Points per game, with an unplayed team pinned at zero.
 *
 * A team with no fixtures behind it has no average at all, but 0/0 is NaN and
 * NaN loses every comparison it takes part in, so such a team would drift to a
 * random place in the table. Zero keeps it bottom, which is where an unplayed
 * team belongs.
 */
export function pointsPerGame(row: { points: number; played: number }): number {
  return row.played === 0 ? 0 : row.points / row.played;
}

export interface StandingsAdjustmentInput {
  teamId: string;
  /** Signed: negative deducts, positive awards. */
  points: number;
  reason?: string;
}

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
  /** Administrative points deductions/awards, applied after every match. */
  adjustments?: StandingsAdjustmentInput[];
  /** First sort key. Defaults to total points. */
  primaryMetric?: PrimaryMetric;
}

export const DEFAULT_STANDINGS_OPTIONS: Required<StandingsOptions> = {
  includeUnconfirmed: true,
  forfeitScore: { winner: 3, loser: 0 },
  pointsForWin: 3,
  pointsForDraw: 1,
  pointsForLoss: 0,
  disciplinary: { yellow: 1, red: 3 },
  formLength: 5,
  adjustments: [],
  primaryMetric: "points",
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
 * The scoreline a forfeit awards, or `null` when neither side forfeited.
 *
 * The reported score is ignored: a forfeit is a ruling, not a result. Exported
 * so the fixture lists can print the same scoreline the table counts, instead
 * of the 0-0 a referee usually types alongside the forfeit box.
 */
export function forfeitScoreline(
  report: { homeForfeit: boolean; awayForfeit: boolean },
  forfeitScore: { winner: number; loser: number },
): { homeGoals: number; awayGoals: number } | null {
  const { winner, loser } = forfeitScore;
  if (report.homeForfeit && report.awayForfeit) return { homeGoals: loser, awayGoals: loser };
  if (report.homeForfeit) return { homeGoals: loser, awayGoals: winner };
  if (report.awayForfeit) return { homeGoals: winner, awayGoals: loser };
  return null;
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
  if (match.countsForStandings === false) return null;

  const report = match.report;
  if (!report) return null;

  const status = String(report.status);
  if (status === "DISPUTED") return null;
  if (status !== "CONFIRMED" && !(options.includeUnconfirmed && status === "SUBMITTED")) {
    return null;
  }

  const awarded = forfeitScoreline(report, options.forfeitScore);
  if (awarded) {
    return {
      ...awarded,
      doubleForfeit: report.homeForfeit && report.awayForfeit,
      byForfeit: true,
    };
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
    adjustments: options.adjustments ?? DEFAULT_STANDINGS_OPTIONS.adjustments,
  };

  const table = new Map<string, Accumulator>();
  for (const team of teams) {
    table.set(team.id, {
      teamId: team.id,
      teamSlug: team.slug ?? team.id,
      teamName: team.name,
      shortName: team.shortName ?? team.name,
      colorPrimary: team.colorPrimary?.trim() || DEFAULT_PRIMARY,
      colorAlternate: team.colorAlternate?.trim() || DEFAULT_ALTERNATE,
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
      pointsAdjustment: 0,
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

    const result = resolveResult(match, opts);
    if (!result) continue;

    const kickoff = toTime(match.kickoffAt);

    // Cards are only counted for matches whose result counts, so that every
    // column in a row is derivable from the same set of reports.
    for (const card of match.report?.discipline ?? []) {
      const target = table.get(card.teamId);
      if (!target) continue;
      if (card.type === "YELLOW") {
        target.yellowCards += 1;
        target.disciplinaryPoints += opts.disciplinary.yellow;
      } else if (card.type === "RED") {
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

  // Administrative deductions land *after* every match is accumulated and
  // *before* any sorting, so they move a team down the table but leave the
  // head-to-head ledger alone -- that mini-league is about what happened on the
  // pitch, and a points deduction is not a result.
  for (const adjustment of opts.adjustments) {
    const row = table.get(adjustment.teamId);
    if (!row) continue; // team outside the requested set (e.g. other division)
    const delta = Math.trunc(adjustment.points);
    if (!Number.isFinite(delta) || delta === 0) continue;
    row.pointsAdjustment += delta;
    row.points += delta;
  }

  const rows = [...table.values()];
  const metric = opts.primaryMetric;

  // Stage 1: points (or points per game) -> goal difference -> goals for.
  rows.sort((a, b) => comparePrimary(a, b, metric));

  // Stage 2: within each block that is level on all three, apply head-to-head,
  // then disciplinary points, then alphabetical order for stability.
  const result: StandingsRow[] = [];
  let index = 0;
  while (index < rows.length) {
    let end = index + 1;
    while (end < rows.length && comparePrimary(rows[index], rows[end], metric) === 0) end += 1;

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
    result[i].separatedBy = whichTiebreaker(result[i - 1], result[i], rows, h2h, metric);
  }

  return result;
}

function comparePrimary(
  a: Pick<StandingsRow, "points" | "played" | "goalDifference" | "goalsFor">,
  b: Pick<StandingsRow, "points" | "played" | "goalDifference" | "goalsFor">,
  metric: PrimaryMetric,
): number {
  const primary = compareByMetric(a, b, metric);
  if (primary !== 0) return primary;
  if (a.goalDifference !== b.goalDifference) return b.goalDifference - a.goalDifference;
  if (a.goalsFor !== b.goalsFor) return b.goalsFor - a.goalsFor;
  return 0;
}

/**
 * Descending comparison on the configured primary metric.
 *
 * Points-per-game is compared by cross-multiplication rather than by dividing,
 * so the ordering is exact integer arithmetic. Dividing would compare floats
 * like 4/3 and 8/6 as unequal and let rounding noise decide a league position.
 * A team with no games played has no rate at all, so it is treated as zero.
 */
function compareByMetric(
  a: Pick<StandingsRow, "points" | "played">,
  b: Pick<StandingsRow, "points" | "played">,
  metric: PrimaryMetric,
): number {
  if (metric === "points") return b.points - a.points;
  if (a.played === 0 && b.played === 0) return 0;
  if (a.played === 0) return b.points > 0 ? 1 : b.points < 0 ? -1 : 0;
  if (b.played === 0) return a.points > 0 ? -1 : a.points < 0 ? 1 : 0;
  return b.points * a.played - a.points * b.played;
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
  metric: PrimaryMetric,
): Tiebreaker {
  if (compareByMetric(above, below, metric) !== 0) return metric;
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
