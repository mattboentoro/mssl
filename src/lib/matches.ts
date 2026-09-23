import type { Prisma } from "@prisma/client";

import type { AuditActor, DbClient } from "@/lib/audit";
import { writeAudit } from "@/lib/audit";
import { CLOSED_MATCH_STATUSES, type KitChoice, type MatchStatus } from "@/lib/enums";
import type { SuspensionReason } from "@/lib/enums";
import { planAccumulationBans, playerKey } from "@/lib/suspensions";

/**
 * Match lifecycle service.
 *
 * All mutations live here (rather than inline in route handlers) so they can be
 * unit tested directly against a real database and reused by both the REST API
 * and server actions. Authorization happens in the caller; this layer enforces
 * *state* rules and concurrency safety.
 */

export type MatchErrorCode =
  | "NOT_FOUND"
  | "ALREADY_ASSIGNED"
  | "NOT_ASSIGNED"
  | "NOT_YOUR_MATCH"
  | "MATCH_CLOSED"
  | "REPORT_EXISTS"
  | "REPORT_MISSING"
  | "VERSION_CONFLICT"
  | "INVALID_STATE";

export class MatchError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code: MatchErrorCode,
  ) {
    super(message);
    this.name = "MatchError";
  }
}

export interface ActorContext extends AuditActor {
  /** Referee row id, when the actor is a referee. */
  refereeId?: string | null;
  isAdmin?: boolean;
}

const isClosed = (status: string): boolean => CLOSED_MATCH_STATUSES.includes(status as MatchStatus);

async function loadMatch(db: DbClient, matchId: string) {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");
  return match;
}

async function closeOpenCaptainResultProposal(
  db: DbClient,
  matchId: string,
  reason: string,
): Promise<void> {
  await db.captainResultProposal.updateMany({
    where: { matchId, status: { in: ["PENDING_OPPONENT", "PENDING_ADMIN"] } },
    data: { status: "REJECTED_ADMIN", reviewedAt: new Date(), reviewNote: reason },
  });
}

/* -------------------------------------------------------------------------- */
/* Self-assignment                                                            */
/* -------------------------------------------------------------------------- */

export interface AssignResult {
  matchId: string;
  refereeId: string;
  version: number;
  /** True when the caller already owned the match (idempotent retry). */
  alreadyOwned: boolean;
}

/**
 * Race-safe referee self-assignment. Claiming a fixture is also what freezes
 * it: there is no separate lock step.
 *
 * The write is a single conditional `updateMany` guarded by BOTH
 * `refereeId: null` and the expected `version`. Two referees pressing the
 * button at the same instant produce exactly one row update; the loser sees
 * `updated.count === 0` and gets a 409.
 */
export async function assignRefereeToMatch(
  db: DbClient,
  params: {
    matchId: string;
    refereeId: string;
    expectedVersion?: number;
    actor: ActorContext;
  },
): Promise<AssignResult> {
  const { matchId, refereeId, expectedVersion, actor } = params;

  const match = await loadMatch(db, matchId);

  if (isClosed(match.status)) {
    throw new MatchError(
      `This match is ${match.status.toLowerCase()} and cannot be assigned.`,
      409,
      "MATCH_CLOSED",
    );
  }
  if (match.refereeId && match.refereeId !== refereeId) {
    throw new MatchError("Another referee already claimed this match.", 409, "ALREADY_ASSIGNED");
  }
  if (expectedVersion !== undefined && expectedVersion !== match.version) {
    throw new MatchError(
      "This fixture changed while you were looking at it. Refresh and try again.",
      409,
      "VERSION_CONFLICT",
    );
  }

  const updated = await db.match.updateMany({
    where: {
      id: matchId,
      refereeId: null,
      version: expectedVersion ?? match.version,
      status: { notIn: [...CLOSED_MATCH_STATUSES] },
    },
    data: {
      refereeId,
      status: "ASSIGNED",
      assignedAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    const current = await loadMatch(db, matchId);
    if (current.refereeId === refereeId) {
      return {
        matchId,
        refereeId,
        version: current.version,
        alreadyOwned: true,
      };
    }
    throw new MatchError("Another referee already claimed this match.", 409, "ALREADY_ASSIGNED");
  }

  await closeOpenCaptainResultProposal(
    db,
    matchId,
    "Closed automatically because a referee was assigned.",
  );

  await writeAudit(db, {
    actor,
    action: "match.assign",
    entity: "Match",
    entityId: matchId,
    metadata: { refereeId, previousVersion: match.version },
  });

  return {
    matchId,
    refereeId,
    version: (expectedVersion ?? match.version) + 1,
    alreadyOwned: false,
  };
}

/**
 * A referee releasing a fixture they claimed by mistake.
 *
 * Allowed right up until they file the report; after that only an admin can
 * reverse it (via `adminAssignReferee(null)`).
 */
export async function unassignReferee(
  db: DbClient,
  params: { matchId: string; actor: ActorContext; reason?: string },
): Promise<void> {
  const { matchId, actor, reason } = params;
  const match = await loadMatch(db, matchId);

  if (!match.refereeId) throw new MatchError("Nobody is assigned.", 409, "NOT_ASSIGNED");

  const isOwner = Boolean(actor.refereeId) && match.refereeId === actor.refereeId;
  if (!isOwner && !actor.isAdmin) {
    throw new MatchError("You are not the assigned referee.", 403, "NOT_YOUR_MATCH");
  }
  if (match.status === "REPORT_SUBMITTED" || match.status === "CONFIRMED") {
    throw new MatchError("A report has already been filed for this match.", 409, "INVALID_STATE");
  }

  const updated = await db.match.updateMany({
    where: { id: matchId, version: match.version },
    data: {
      refereeId: null,
      assignedAt: null,
      status: "SCHEDULED",
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new MatchError("The fixture changed. Refresh and try again.", 409, "VERSION_CONFLICT");
  }

  await writeAudit(db, {
    actor,
    action: actor.isAdmin && !isOwner ? "match.force_unassign" : "match.unassign",
    entity: "Match",
    entityId: matchId,
    metadata: { previousRefereeId: match.refereeId, reason: reason ?? null },
  });
}

/* -------------------------------------------------------------------------- */
/* Game report                                                                */
/* -------------------------------------------------------------------------- */

/**
 * A card filed on a game report. The league keeps no squad lists, so the
 * player is free text exactly as the referee recorded it.
 */
export interface ReportCardInput {
  type: string;
  teamId: string;
  playerName: string;
  minute?: number | null;
  note?: string | null;
}

export interface GameReportInput {
  homeScore: number;
  awayScore: number;
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  notes?: string | null;
  incidentReport?: string | null;
  misconduct?: string | null;
  cards?: ReportCardInput[];
}

export interface OfficialResultInput {
  matchId: string;
  actor: ActorContext;
  reason: string;
  homeScore: number;
  awayScore: number;
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  notes?: string | null;
}

/**
 * Create an official result on an unreported fixture.
 *
 * Callers that approve a pending workflow pass the version they reviewed.
 * The guarded match update happens before the report insert so referee
 * assignment, fixture edits, reopening, and another result writer all cause
 * the surrounding transaction to roll back rather than publish stale data.
 */
export async function createOfficialGameReport(
  db: DbClient,
  params: OfficialResultInput & {
    expectedVersion: number;
    requireUnassigned?: boolean;
  },
): Promise<{ reportId: string }> {
  const match = await db.match.findUnique({
    where: { id: params.matchId },
    select: {
      id: true,
      refereeId: true,
      status: true,
      version: true,
      report: { select: { id: true } },
    },
  });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");
  if (match.report) {
    throw new MatchError("A report has already been filed for this match.", 409, "REPORT_EXISTS");
  }
  if (match.version !== params.expectedVersion) {
    throw new MatchError("The fixture changed. Refresh and try again.", 409, "VERSION_CONFLICT");
  }
  if (params.requireUnassigned && match.refereeId) {
    throw new MatchError("A referee is now assigned to this match.", 409, "ALREADY_ASSIGNED");
  }
  if (match.status !== "SCHEDULED") {
    throw new MatchError(
      `A match in state ${match.status} cannot accept this result.`,
      409,
      "INVALID_STATE",
    );
  }

  const updated = await db.match.updateMany({
    where: {
      id: params.matchId,
      version: params.expectedVersion,
      status: "SCHEDULED",
      ...(params.requireUnassigned ? { refereeId: null } : {}),
      report: { is: null },
    },
    data: { status: "CONFIRMED", version: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new MatchError("The fixture changed. Refresh and try again.", 409, "VERSION_CONFLICT");
  }

  const report = await db.gameReport.create({
    data: {
      matchId: params.matchId,
      refereeId: match.refereeId,
      homeScore: params.homeScore,
      awayScore: params.awayScore,
      homeForfeit: params.homeForfeit ?? false,
      awayForfeit: params.awayForfeit ?? false,
      notes: params.notes ?? null,
      overrideReason: params.reason,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: params.actor.id ?? null,
    },
    select: { id: true },
  });
  return { reportId: report.id };
}

/**
 * File the referee's report. The match must be assigned to the caller.
 * On success the match moves to REPORT_SUBMITTED and the report becomes
 * read-only for the referee.
 */
export async function submitGameReport(
  db: DbClient,
  params: {
    matchId: string;
    refereeId: string;
    actor: ActorContext;
    input: GameReportInput;
  },
): Promise<{ reportId: string }> {
  if ("$transaction" in db) {
    return db.$transaction((tx) => submitGameReport(tx, params));
  }
  const { matchId, refereeId, actor, input } = params;

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: { report: { select: { id: true } } },
  });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");

  const isOwner = match.refereeId === refereeId;
  if (!match.refereeId) {
    throw new MatchError("Claim the match before filing the report.", 409, "NOT_ASSIGNED");
  }
  if (!isOwner && !actor.isAdmin) {
    throw new MatchError("Only the assigned referee can file this report.", 403, "NOT_YOUR_MATCH");
  }
  if (match.report) {
    throw new MatchError("A report has already been filed for this match.", 409, "REPORT_EXISTS");
  }
  if (match.status !== "ASSIGNED") {
    throw new MatchError(
      `A match in state ${match.status} cannot accept a report.`,
      409,
      "INVALID_STATE",
    );
  }

  const cards = input.cards ?? [];
  const validTeamIds = new Set([match.homeTeamId, match.awayTeamId]);
  for (const card of cards) {
    if (!validTeamIds.has(card.teamId)) {
      throw new MatchError(
        "A card references a team that is not playing in this match.",
        400,
        "INVALID_STATE",
      );
    }
  }

  const homeForfeit = Boolean(input.homeForfeit);
  const awayForfeit = Boolean(input.awayForfeit);

  const report = await db.gameReport.create({
    data: {
      matchId,
      refereeId,
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      homeForfeit,
      awayForfeit,
      notes: input.notes ?? null,
      incidentReport: input.incidentReport ?? null,
      misconduct: input.misconduct ?? null,
      status: "SUBMITTED",
      submittedAt: new Date(),
      discipline: {
        create: cards.map((card) => ({
          seasonId: match.seasonId,
          matchId,
          type: card.type,
          teamId: card.teamId,
          playerName: card.playerName,
          minute: card.minute ?? null,
          note: card.note ?? null,
          issuedBy: "REFEREE",
        })),
      },
    },
    select: { id: true },
  });

  // A yellow filed here may be the player's third of the season, which earns an
  // automatic ban with nobody in the loop. Reds are left for an administrator
  // to weigh up, so they stay pending.
  const yellowPlayers = new Map<string, { teamId: string; playerName: string }>();
  for (const card of cards) {
    if (card.type !== "YELLOW") continue;
    yellowPlayers.set(playerKey(card.teamId, card.playerName), {
      teamId: card.teamId,
      playerName: card.playerName,
    });
  }
  for (const player of yellowPlayers.values()) {
    await applyAccumulationRule(db, { seasonId: match.seasonId, ...player });
  }

  const updated = await db.match.updateMany({
    where: { id: matchId, status: "ASSIGNED", version: match.version },
    data: {
      status: homeForfeit || awayForfeit ? "FORFEIT" : "REPORT_SUBMITTED",
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new MatchError("The fixture changed while filing. Try again.", 409, "VERSION_CONFLICT");
  }

  await closeOpenCaptainResultProposal(
    db,
    matchId,
    "Closed automatically because an official referee report was filed.",
  );

  await writeAudit(db, {
    actor,
    action: "report.submit",
    entity: "GameReport",
    entityId: report.id,
    metadata: {
      matchId,
      score: `${input.homeScore}-${input.awayScore}`,
      cards: cards.length,
      homeForfeit,
      awayForfeit,
    },
  });

  return { reportId: report.id };
}

/* -------------------------------------------------------------------------- */
/* Admin review                                                               */
/* -------------------------------------------------------------------------- */

export async function confirmGameReport(
  db: DbClient,
  params: { matchId: string; actor: ActorContext },
): Promise<void> {
  const { matchId, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const report = await db.gameReport.findUnique({ where: { matchId } });
  if (!report) throw new MatchError("No report to confirm.", 404, "REPORT_MISSING");

  await db.gameReport.update({
    where: { id: report.id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: actor.id ?? null,
      disputeReason: null,
    },
  });

  await db.match.update({
    where: { id: matchId },
    data: { status: "CONFIRMED", version: { increment: 1 } },
  });
  await writeAudit(db, {
    actor,
    action: "report.confirm",
    entity: "GameReport",
    entityId: report.id,
    metadata: { matchId },
  });
}

export async function disputeGameReport(
  db: DbClient,
  params: { matchId: string; actor: ActorContext; reason: string },
): Promise<void> {
  const { matchId, actor, reason } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const report = await db.gameReport.findUnique({ where: { matchId } });
  if (!report) throw new MatchError("No report to dispute.", 404, "REPORT_MISSING");

  await db.gameReport.update({
    where: { id: report.id },
    data: { status: "DISPUTED", confirmedAt: null, disputeReason: reason },
  });

  await db.match.update({
    where: { id: matchId },
    data: { status: "ASSIGNED", version: { increment: 1 } },
  });
  await writeAudit(db, {
    actor,
    action: "report.dispute",
    entity: "GameReport",
    entityId: report.id,
    metadata: { matchId, reason },
  });
}

/**
 * Remove a filed report so its assigned referee can submit a corrected one.
 *
 * The route calls this inside a transaction: deleting the report also
 * cascades its referee-issued disciplinary rows, while the audit snapshot
 * preserves what was removed and why.
 */
export async function reopenGameReport(
  db: DbClient,
  params: { matchId: string; actor: ActorContext; reason: string },
): Promise<void> {
  if ("$transaction" in db) {
    return db.$transaction((tx) => reopenGameReport(tx, params));
  }
  const { matchId, actor, reason } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, refereeId: true, status: true },
  });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");

  const report = await db.gameReport.findUnique({
    where: { matchId },
    include: { _count: { select: { discipline: true } } },
  });
  if (!report) throw new MatchError("No report to reopen.", 404, "REPORT_MISSING");

  await db.gameReport.delete({ where: { id: report.id } });
  await db.match.update({
    where: { id: matchId },
    data: {
      status: match.refereeId ? "ASSIGNED" : "SCHEDULED",
      assignedAt: match.refereeId ? undefined : null,
      version: { increment: 1 },
    },
  });
  await closeOpenCaptainResultProposal(
    db,
    matchId,
    "Closed automatically when the official report was reopened.",
  );

  await writeAudit(db, {
    actor,
    action: "report.reopen",
    entity: "Match",
    entityId: matchId,
    metadata: {
      reason,
      reportId: report.id,
      refereeId: match.refereeId,
      previousMatchStatus: match.status,
      removedReport: {
        status: report.status,
        homeScore: report.homeScore,
        awayScore: report.awayScore,
        homeForfeit: report.homeForfeit,
        awayForfeit: report.awayForfeit,
        disciplineCount: report._count.discipline,
      },
    },
  });
}

/**
 * Admin override of a result. A reason is mandatory and audited.
 *
 * The fixture need not have a report: a referee may never file one, and the
 * league still has to be able to record the score. In that case the admin's
 * entry *becomes* the report, credited to the assigned referee if there is one
 * and to nobody if there is not. The standings read reports and nothing else,
 * so this is the only way an unreported result can reach the table.
 */
export async function overrideGameReport(
  db: DbClient,
  params: {
    matchId: string;
    actor: ActorContext;
    reason: string;
    homeScore: number;
    awayScore: number;
    homeForfeit?: boolean;
    awayForfeit?: boolean;
    expectedMatchVersion?: number;
    expectedReportId?: string;
    expectedReportUpdatedAt?: Date;
  },
): Promise<void> {
  if ("$transaction" in db) {
    return db.$transaction((tx) => overrideGameReport(tx, params));
  }
  const { matchId, actor, reason } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await db.match.findUnique({
    where: { id: matchId },
    select: { id: true, refereeId: true },
  });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");

  const report = await db.gameReport.findUnique({ where: { matchId } });

  const before = report
    ? {
        homeScore: report.homeScore,
        awayScore: report.awayScore,
        homeForfeit: report.homeForfeit,
        awayForfeit: report.awayForfeit,
      }
    : null;

  const result = {
    homeScore: params.homeScore,
    awayScore: params.awayScore,
    homeForfeit: params.homeForfeit ?? false,
    awayForfeit: params.awayForfeit ?? false,
    overrideReason: reason,
    status: "CONFIRMED",
    confirmedAt: new Date(),
    confirmedById: actor.id ?? null,
  };

  let saved: { id: string };
  if (params.expectedReportId) {
    const updated = await db.gameReport.updateMany({
      where: {
        id: params.expectedReportId,
        matchId,
        ...(params.expectedReportUpdatedAt ? { updatedAt: params.expectedReportUpdatedAt } : {}),
      },
      data: result,
    });
    if (!updated.count) {
      throw new MatchError(
        "The report changed while applying the override.",
        409,
        "VERSION_CONFLICT",
      );
    }
    saved = { id: params.expectedReportId };
  } else {
    saved = report
      ? await db.gameReport.update({ where: { id: report.id }, data: result })
      : await db.gameReport.create({
          data: { ...result, matchId, refereeId: match.refereeId ?? null },
        });
  }

  if (params.expectedMatchVersion === undefined) {
    await db.match.update({
      where: { id: matchId },
      data: { status: "CONFIRMED", version: { increment: 1 } },
    });
  } else {
    const updated = await db.match.updateMany({
      where: { id: matchId, version: params.expectedMatchVersion },
      data: { status: "CONFIRMED", version: { increment: 1 } },
    });
    if (!updated.count) {
      throw new MatchError(
        "The fixture changed while applying the override.",
        409,
        "VERSION_CONFLICT",
      );
    }
  }
  await closeOpenCaptainResultProposal(
    db,
    matchId,
    "Closed automatically because an Admin entered an official result.",
  );

  await writeAudit(db, {
    actor,
    action: report ? "report.override" : "report.enter",
    entity: "GameReport",
    entityId: saved.id,
    metadata: { matchId, reason, before, after: { ...params, actor: undefined } },
  });
}

/** Admin reschedule / postpone / cancel, fixture correction, and kit selection. */
export async function updateMatchSchedule(
  db: DbClient,
  params: {
    matchId: string;
    actor: ActorContext;
    kickoffAt?: Date;
    venueName?: string | null;
    status?: MatchStatus;
    matchweek?: string;
    countsForStandings?: boolean;
    divisionId?: string;
    homeTeamId?: string;
    awayTeamId?: string;
    homeKit?: KitChoice;
    awayKit?: KitChoice;
    reason?: string;
  },
): Promise<void> {
  const { matchId, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await loadMatch(db, matchId);
  const data: Prisma.MatchUpdateInput = { version: { increment: 1 } };
  if (params.kickoffAt) data.kickoffAt = params.kickoffAt;
  if (params.venueName !== undefined) {
    data.venueName = params.venueName?.trim() || null;
  }
  const nextStatus = params.status ?? match.status;
  if (params.status) data.status = nextStatus;
  if (params.matchweek) data.matchweek = params.matchweek;
  if (params.countsForStandings !== undefined) {
    data.countsForStandings = params.countsForStandings;
  }
  if (params.homeKit) data.homeKit = params.homeKit;
  if (params.awayKit) data.awayKit = params.awayKit;

  /*
    Who is playing whom can still be corrected after the fixture is created,
    but never once a report exists: every goal and card names a team, so
    swapping the teams underneath would leave the report pointing at clubs
    that are no longer in the match.
  */
  const homeTeamId = params.homeTeamId ?? match.homeTeamId;
  const awayTeamId = params.awayTeamId ?? match.awayTeamId;
  const movingFixture =
    (params.homeTeamId !== undefined && params.homeTeamId !== match.homeTeamId) ||
    (params.awayTeamId !== undefined && params.awayTeamId !== match.awayTeamId) ||
    (params.divisionId !== undefined && params.divisionId !== match.divisionId);

  if (movingFixture) {
    const report = await db.gameReport.findUnique({ where: { matchId }, select: { id: true } });
    if (report) {
      throw new MatchError(
        "A report has been filed for this fixture, so the teams can no longer be changed. Override the result instead, or delete and re-create the fixture.",
        409,
        "INVALID_STATE",
      );
    }
    if (homeTeamId === awayTeamId) {
      throw new MatchError("A team cannot play itself.", 400, "INVALID_STATE");
    }
    if (params.divisionId) data.division = { connect: { id: params.divisionId } };
    if (params.homeTeamId) data.homeTeam = { connect: { id: params.homeTeamId } };
    if (params.awayTeamId) data.awayTeam = { connect: { id: params.awayTeamId } };
  }

  await db.match.update({ where: { id: matchId }, data });

  await writeAudit(db, {
    actor,
    action: "match.update",
    entity: "Match",
    entityId: matchId,
    metadata: {
      reason: params.reason ?? null,
      before: {
        kickoffAt: match.kickoffAt,
        status: match.status,
        venueName: match.venueName,
        matchweek: match.matchweek,
        countsForStandings: match.countsForStandings,
        divisionId: match.divisionId,
        homeTeamId: match.homeTeamId,
        awayTeamId: match.awayTeamId,
        homeKit: match.homeKit,
        awayKit: match.awayKit,
      },
      after: {
        kickoffAt: params.kickoffAt ?? match.kickoffAt,
        status: nextStatus,
        venueName: params.venueName === undefined ? match.venueName : params.venueName,
        matchweek: params.matchweek ?? match.matchweek,
        countsForStandings: params.countsForStandings ?? match.countsForStandings,
        divisionId: movingFixture ? (params.divisionId ?? match.divisionId) : match.divisionId,
        homeTeamId: movingFixture ? homeTeamId : match.homeTeamId,
        awayTeamId: movingFixture ? awayTeamId : match.awayTeamId,
        homeKit: params.homeKit ?? match.homeKit,
        awayKit: params.awayKit ?? match.awayKit,
      },
    },
  });
}

/** Admin assignment of a specific referee (bypasses self-assignment). */
export async function adminAssignReferee(
  db: DbClient,
  params: { matchId: string; refereeId: string | null; actor: ActorContext; reason?: string },
): Promise<void> {
  if ("$transaction" in db) {
    return db.$transaction((tx) => adminAssignReferee(tx, params));
  }
  const { matchId, refereeId, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await loadMatch(db, matchId);

  await db.match.update({
    where: { id: matchId },
    data: {
      refereeId,
      assignedAt: refereeId ? new Date() : null,
      status: refereeId ? (match.status === "SCHEDULED" ? "ASSIGNED" : match.status) : "SCHEDULED",
      version: { increment: 1 },
    },
  });
  if (refereeId) {
    await closeOpenCaptainResultProposal(
      db,
      matchId,
      "Closed automatically because a referee was assigned.",
    );
  }

  await writeAudit(db, {
    actor,
    action: refereeId ? "match.admin_assign" : "match.force_unassign",
    entity: "Match",
    entityId: matchId,
    metadata: { previousRefereeId: match.refereeId, refereeId, reason: params.reason ?? null },
  });
}

/* -------------------------------------------------------------------------- */
/* Discipline                                                                 */
/* -------------------------------------------------------------------------- */

export interface DisciplinaryInput {
  seasonId: string;
  teamId: string;
  matchId?: string | null;
  playerName: string;
  type: string;
  minute?: number | null;
  note?: string | null;
  /** Ban length in fixtures. Null leaves a red card awaiting review. */
  gamesSuspended?: number | null;
}

/**
 * Re-apply the automatic yellow-accumulation ban for one player.
 *
 * Called after anything that changes a player's yellow count. It recomputes
 * from scratch instead of incrementing, so rescinding a card moves the ban onto
 * whichever yellow is now third rather than leaving a ban with nothing behind
 * it. Bans an administrator decided on are never touched.
 */
export async function applyAccumulationRule(
  db: DbClient,
  params: { seasonId: string; teamId: string; playerName: string },
): Promise<void> {
  const { seasonId, teamId } = params;

  // Free-text names, so pull the team's season and fold them in memory rather
  // than trusting the database to match "J. Smith" against "j. smith".
  const key = playerKey(teamId, params.playerName);
  const yellows = await db.disciplinaryAction.findMany({
    where: { seasonId, teamId, type: "YELLOW" },
    select: {
      id: true,
      playerName: true,
      gamesSuspended: true,
      suspensionReason: true,
      createdAt: true,
    },
  });

  const mine = yellows.filter((card) => playerKey(teamId, card.playerName) === key);
  const changes = planAccumulationBans(mine);

  for (const change of changes) {
    await db.disciplinaryAction.update({
      where: { id: change.id },
      data: {
        gamesSuspended: change.gamesSuspended,
        suspensionReason: change.suspensionReason,
      },
    });
  }
}

/**
 * A league-issued sanction recorded by an admin, outside any game report.
 * Referee-filed cards arrive through `submitGameReport` instead.
 */
export async function addDisciplinaryAction(
  db: DbClient,
  params: { actor: ActorContext; input: DisciplinaryInput },
): Promise<{ id: string }> {
  const { actor, input } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  // Teams are league-wide, so any club can be sanctioned in any season. The
  // season comes from the caller and is recorded on the action itself.
  const team = await db.team.findUnique({
    where: { id: input.teamId },
    select: { id: true },
  });
  if (!team) throw new MatchError("Team not found.", 404, "NOT_FOUND");

  const games = input.gamesSuspended ?? null;
  const created = await db.disciplinaryAction.create({
    data: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      matchId: input.matchId ?? null,
      playerName: input.playerName,
      type: input.type,
      minute: input.minute ?? null,
      note: input.note ?? null,
      issuedBy: "ADMIN",
      gamesSuspended: games,
      // An administrator typing a length in is making the decision themselves,
      // so the ban is theirs rather than the accumulation rule's. Leaving it
      // unattributed would let the rule overwrite it on the next recount.
      suspensionReason:
        games === null ? null : input.type === "RED" ? "RED_CARD" : "LEAGUE_SANCTION",
    },
    select: { id: true },
  });

  if (input.type === "YELLOW" && games === null) {
    await applyAccumulationRule(db, {
      seasonId: input.seasonId,
      teamId: input.teamId,
      playerName: input.playerName,
    });
  }

  await writeAudit(db, {
    actor,
    action: "discipline.create",
    entity: "DisciplinaryAction",
    entityId: created.id,
    metadata: { ...input },
  });

  return created;
}

/**
 * Set how long a player is banned for.
 *
 * This is the review step for a red card: the card arrives with no length and
 * stays pending until someone decides. Zero is a real answer — it records that
 * the card was looked at and warranted no ban, which is what stops it sitting
 * in the review queue forever.
 */
export async function setSuspensionLength(
  db: DbClient,
  params: { id: string; games: number; note?: string | null; actor: ActorContext },
): Promise<void> {
  const { id, games, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");
  if (!Number.isInteger(games) || games < 0) {
    throw new MatchError("Games suspended must be zero or more.", 400, "INVALID_STATE");
  }

  const existing = await db.disciplinaryAction.findUnique({ where: { id } });
  if (!existing) throw new MatchError("Disciplinary record not found.", 404, "NOT_FOUND");

  const reason: SuspensionReason | null =
    games === 0 ? null : existing.type === "RED" ? "RED_CARD" : "LEAGUE_SANCTION";

  await db.disciplinaryAction.update({
    where: { id },
    data: {
      gamesSuspended: games,
      suspensionReason: reason,
      note: params.note === undefined ? existing.note : (params.note ?? null),
    },
  });

  await writeAudit(db, {
    actor,
    action: "discipline.suspend",
    entity: "DisciplinaryAction",
    entityId: id,
    metadata: {
      teamId: existing.teamId,
      playerName: existing.playerName,
      type: existing.type,
      games,
      previousGames: existing.gamesSuspended,
    },
  });
}

/** Rescind a sanction. Referee-filed cards can be removed too, with an audit trail. */
export async function deleteDisciplinaryAction(
  db: DbClient,
  params: { id: string; actor: ActorContext },
): Promise<void> {
  const { id, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const existing = await db.disciplinaryAction.findUnique({ where: { id } });
  if (!existing) throw new MatchError("Disciplinary record not found.", 404, "NOT_FOUND");

  await db.disciplinaryAction.delete({ where: { id } });

  // Removing a yellow can shift which of the remaining ones is third, so the
  // automatic ban has to be recounted.
  if (existing.type === "YELLOW") {
    await applyAccumulationRule(db, {
      seasonId: existing.seasonId,
      teamId: existing.teamId,
      playerName: existing.playerName,
    });
  }

  await writeAudit(db, {
    actor,
    action: "discipline.delete",
    entity: "DisciplinaryAction",
    entityId: id,
    metadata: {
      teamId: existing.teamId,
      playerName: existing.playerName,
      type: existing.type,
      issuedBy: existing.issuedBy,
    },
  });
}
