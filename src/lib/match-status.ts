/**
 * What a fixture's badge says.
 *
 * The stored `MatchStatus` is a workflow record — it tracks who claimed a
 * fixture and how far its report got. That is the wrong thing to show a reader,
 * who only wants to know whether the game has been played and whether the score
 * is in yet. So the badge is derived from the three facts that answer that:
 * whether a report exists, whether kick-off has passed, and whether anyone is
 * refereeing. The stored status is consulted only for the two outcomes nothing
 * else can imply — a fixture called off or put back.
 */

export type MatchDisplayStatus =
  | "COMPLETED"
  | "FORFEITED"
  | "WAITING_REPORT"
  | "NOT_STARTED"
  | "NEEDS_REFEREE"
  | "POSTPONED"
  | "CANCELLED";

export const MATCH_DISPLAY_LABELS: Record<MatchDisplayStatus, string> = {
  COMPLETED: "Completed",
  FORFEITED: "Forfeited",
  WAITING_REPORT: "Waiting report",
  NOT_STARTED: "Not started",
  NEEDS_REFEREE: "Need a referee",
  POSTPONED: "Postponed",
  CANCELLED: "Cancelled",
};

/** The part of a report that changes what a fixture shows. */
export type ReportOutcome = { homeForfeit: boolean; awayForfeit: boolean };

export type MatchDisplayInput = {
  status: string;
  refereeId: string | null;
  kickoffAt: Date | string;
  /**
   * The filed report, by the referee or by an admin override. Passed whole
   * rather than as a `hasResult` flag so a caller cannot say a score exists
   * while leaving out how it was reached.
   */
  report: ReportOutcome | null;
};

export const isForfeit = (report: ReportOutcome | null): boolean =>
  Boolean(report && (report.homeForfeit || report.awayForfeit));

export function matchDisplayStatus(
  match: MatchDisplayInput,
  now: Date = new Date(),
): MatchDisplayStatus {
  if (match.status === "CANCELLED") return "CANCELLED";
  if (match.status === "POSTPONED") return "POSTPONED";

  // A score is the end of the story regardless of the clock: an admin can file
  // one early, and a confirmed result must not drop back to "waiting".
  if (isForfeit(match.report)) return "FORFEITED";
  if (match.report) return "COMPLETED";

  const kickoff = match.kickoffAt instanceof Date ? match.kickoffAt : new Date(match.kickoffAt);
  if (kickoff.getTime() <= now.getTime()) return "WAITING_REPORT";

  return match.refereeId ? "NOT_STARTED" : "NEEDS_REFEREE";
}

/**
 * The buckets Match Control offers as a filter, in the order a fixture moves
 * through them.
 *
 * `POSTPONED` is deliberately absent. The badge still says it when a fixture
 * is called off to a later date, but a postponed match is a scheduling note
 * rather than a state anyone filters a fixture list by.
 */
export const MATCH_DISPLAY_STATUSES = [
  "NEEDS_REFEREE",
  "NOT_STARTED",
  "WAITING_REPORT",
  "COMPLETED",
  "FORFEITED",
  "CANCELLED",
] as const satisfies readonly MatchDisplayStatus[];

export function isMatchDisplayStatus(value: string): value is MatchDisplayStatus {
  return (MATCH_DISPLAY_STATUSES as readonly string[]).includes(value);
}

/** Statuses that settle a fixture outright, so no amount of clock-watching applies. */
const OFF_STATUSES = ["CANCELLED", "POSTPONED"];

const FORFEITED_BY_EITHER = { OR: [{ homeForfeit: true }, { awayForfeit: true }] };

/**
 * The same rules as `matchDisplayStatus`, expressed as a Prisma filter.
 *
 * Match Control filters on what the badge says rather than on the stored
 * column, so the two have to agree. Returned as a fragment to be ANDed in: the
 * caller already owns `kickoffAt` for the date window and the calendar month.
 */
export function matchDisplayWhere(
  display: MatchDisplayStatus,
  now: Date = new Date(),
): Record<string, unknown> {
  if (display === "CANCELLED" || display === "POSTPONED") return { status: display };

  const inPlay = { status: { notIn: OFF_STATUSES } };
  if (display === "FORFEITED") return { ...inPlay, report: { is: FORFEITED_BY_EITHER } };
  if (display === "COMPLETED") {
    return { ...inPlay, report: { is: { homeForfeit: false, awayForfeit: false } } };
  }

  const awaiting = { ...inPlay, report: { is: null } };
  if (display === "WAITING_REPORT") return { ...awaiting, kickoffAt: { lte: now } };

  return {
    ...awaiting,
    kickoffAt: { gt: now },
    refereeId: display === "NOT_STARTED" ? { not: null } : null,
  };
}
