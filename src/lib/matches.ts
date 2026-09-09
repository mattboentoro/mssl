import type { Prisma } from "@prisma/client";

import type { AuditActor, DbClient } from "@/lib/audit";
import { writeAudit } from "@/lib/audit";
import { CLOSED_MATCH_STATUSES, type MatchStatus } from "@/lib/enums";

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
  | "MATCH_LOCKED"
  | "NOT_LOCKED"
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

const isClosed = (status: string): boolean =>
  CLOSED_MATCH_STATUSES.includes(status as MatchStatus);

async function loadMatch(db: DbClient, matchId: string) {
  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");
  return match;
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
 * Race-safe referee self-assignment.
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

/** A referee dropping a match they claimed. Only allowed before it is locked. */
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
  if (match.lockedAt && !actor.isAdmin) {
    throw new MatchError(
      "This match is locked. Only a league admin can reverse it now.",
      409,
      "MATCH_LOCKED",
    );
  }
  if (match.status === "REPORT_SUBMITTED" || match.status === "CONFIRMED") {
    throw new MatchError(
      "A report has already been filed for this match.",
      409,
      "INVALID_STATE",
    );
  }

  const updated = await db.match.updateMany({
    where: { id: matchId, version: match.version },
    data: {
      refereeId: null,
      assignedAt: null,
      lockedAt: null,
      lockedById: null,
      lockedByName: null,
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
/* Locking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Freeze the fixture and rosters ahead of kickoff. Only the assigned referee
 * (or an admin) may lock, and locking blocks reassignment.
 */
export async function lockMatch(
  db: DbClient,
  params: { matchId: string; actor: ActorContext; expectedVersion?: number },
): Promise<{ version: number }> {
  const { matchId, actor, expectedVersion } = params;
  const match = await loadMatch(db, matchId);

  if (!match.refereeId) {
    throw new MatchError("Assign yourself before locking the match.", 409, "NOT_ASSIGNED");
  }
  const isOwner = Boolean(actor.refereeId) && match.refereeId === actor.refereeId;
  if (!isOwner && !actor.isAdmin) {
    throw new MatchError("Only the assigned referee can lock this match.", 403, "NOT_YOUR_MATCH");
  }
  if (match.status === "LOCKED") {
    throw new MatchError("This match is already locked.", 409, "MATCH_LOCKED");
  }
  if (match.status !== "ASSIGNED") {
    throw new MatchError(
      `A match in state ${match.status} cannot be locked.`,
      409,
      "INVALID_STATE",
    );
  }
  if (expectedVersion !== undefined && expectedVersion !== match.version) {
    throw new MatchError("The fixture changed. Refresh and try again.", 409, "VERSION_CONFLICT");
  }

  const now = new Date();
  const updated = await db.match.updateMany({
    where: {
      id: matchId,
      status: "ASSIGNED",
      refereeId: match.refereeId,
      version: match.version,
    },
    data: {
      status: "LOCKED",
      lockedAt: now,
      lockedById: actor.refereeId ?? actor.id ?? null,
      lockedByName: actor.name ?? null,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    throw new MatchError("This match is already locked.", 409, "MATCH_LOCKED");
  }

  await writeAudit(db, {
    actor,
    action: "match.lock",
    entity: "Match",
    entityId: matchId,
    metadata: { lockedAt: now.toISOString(), byAdmin: Boolean(actor.isAdmin && !isOwner) },
  });

  return { version: match.version + 1 };
}

/** Admin-only reversal of a lock. */
export async function forceUnlockMatch(
  db: DbClient,
  params: { matchId: string; actor: ActorContext; reason: string },
): Promise<void> {
  const { matchId, actor, reason } = params;
  if (!actor.isAdmin) {
    throw new MatchError("Only a league admin can unlock a match.", 403, "NOT_YOUR_MATCH");
  }

  const match = await loadMatch(db, matchId);
  if (match.status !== "LOCKED") {
    throw new MatchError("This match is not locked.", 409, "NOT_LOCKED");
  }

  await db.match.update({
    where: { id: matchId },
    data: {
      status: match.refereeId ? "ASSIGNED" : "SCHEDULED",
      lockedAt: null,
      lockedById: null,
      lockedByName: null,
      version: { increment: 1 },
    },
  });

  await writeAudit(db, {
    actor,
    action: "match.force_unlock",
    entity: "Match",
    entityId: matchId,
    metadata: { reason },
  });
}

/* -------------------------------------------------------------------------- */
/* Game report                                                                */
/* -------------------------------------------------------------------------- */

export interface GameEventInput {
  type: string;
  teamId: string;
  playerId?: string | null;
  minute: number;
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
  events?: GameEventInput[];
}

/** Goals implied by the itemised events (own goals credit the opponent). */
export function tallyGoalsFromEvents(
  events: GameEventInput[],
  homeTeamId: string,
  awayTeamId: string,
): { home: number; away: number } {
  let home = 0;
  let away = 0;
  for (const event of events) {
    const scoresForHome =
      (event.teamId === homeTeamId && event.type !== "OWN_GOAL") ||
      (event.teamId === awayTeamId && event.type === "OWN_GOAL");

    if (event.type === "GOAL" || event.type === "PENALTY_GOAL" || event.type === "OWN_GOAL") {
      if (scoresForHome) home += 1;
      else away += 1;
    }
  }
  return { home, away };
}

/**
 * File the referee's report. The match must be LOCKED and owned by the caller.
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
  const { matchId, refereeId, actor, input } = params;

  const match = await db.match.findUnique({
    where: { id: matchId },
    include: {
      report: { select: { id: true } },
      homeTeam: { select: { id: true, players: { select: { id: true } } } },
      awayTeam: { select: { id: true, players: { select: { id: true } } } },
    },
  });
  if (!match) throw new MatchError("Match not found.", 404, "NOT_FOUND");

  const isOwner = match.refereeId === refereeId;
  if (!isOwner && !actor.isAdmin) {
    throw new MatchError(
      "Only the assigned referee can file this report.",
      403,
      "NOT_YOUR_MATCH",
    );
  }
  if (match.report) {
    throw new MatchError("A report has already been filed for this match.", 409, "REPORT_EXISTS");
  }
  if (match.status !== "LOCKED") {
    throw new MatchError(
      "Lock the match before submitting the game report.",
      409,
      "NOT_LOCKED",
    );
  }

  const events = input.events ?? [];
  const validTeamIds = new Set([match.homeTeamId, match.awayTeamId]);
  const rosterByTeam = new Map<string, Set<string>>([
    [match.homeTeamId, new Set(match.homeTeam.players.map((p) => p.id))],
    [match.awayTeamId, new Set(match.awayTeam.players.map((p) => p.id))],
  ]);

  for (const event of events) {
    if (!validTeamIds.has(event.teamId)) {
      throw new MatchError(
        "An event references a team that is not playing in this match.",
        400,
        "INVALID_STATE",
      );
    }
    if (event.playerId && !rosterByTeam.get(event.teamId)?.has(event.playerId)) {
      throw new MatchError(
        "An event references a player who is not on that team's roster.",
        400,
        "INVALID_STATE",
      );
    }
  }

  const homeForfeit = Boolean(input.homeForfeit);
  const awayForfeit = Boolean(input.awayForfeit);

  if (!homeForfeit && !awayForfeit) {
    const tally = tallyGoalsFromEvents(events, match.homeTeamId, match.awayTeamId);
    if (tally.home !== input.homeScore || tally.away !== input.awayScore) {
      throw new MatchError(
        `Score ${input.homeScore}-${input.awayScore} does not match the ${tally.home}-${tally.away} recorded in the goal events.`,
        400,
        "INVALID_STATE",
      );
    }
  }

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
      events: {
        create: events.map((event) => ({
          type: event.type,
          teamId: event.teamId,
          playerId: event.playerId ?? null,
          minute: event.minute,
          note: event.note ?? null,
        })),
      },
    },
    select: { id: true },
  });

  const updated = await db.match.updateMany({
    where: { id: matchId, status: "LOCKED", version: match.version },
    data: {
      status: homeForfeit || awayForfeit ? "FORFEIT" : "REPORT_SUBMITTED",
      version: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    throw new MatchError("The fixture changed while filing. Try again.", 409, "VERSION_CONFLICT");
  }

  await writeAudit(db, {
    actor,
    action: "report.submit",
    entity: "GameReport",
    entityId: report.id,
    metadata: {
      matchId,
      score: `${input.homeScore}-${input.awayScore}`,
      events: events.length,
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
    data: { status: "LOCKED", version: { increment: 1 } },
  });

  await writeAudit(db, {
    actor,
    action: "report.dispute",
    entity: "GameReport",
    entityId: report.id,
    metadata: { matchId, reason },
  });
}

/** Admin override of a filed result. A reason is mandatory and audited. */
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
  },
): Promise<void> {
  const { matchId, actor, reason } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const report = await db.gameReport.findUnique({ where: { matchId } });
  if (!report) throw new MatchError("No report to override.", 404, "REPORT_MISSING");

  const before = {
    homeScore: report.homeScore,
    awayScore: report.awayScore,
    homeForfeit: report.homeForfeit,
    awayForfeit: report.awayForfeit,
  };

  await db.gameReport.update({
    where: { id: report.id },
    data: {
      homeScore: params.homeScore,
      awayScore: params.awayScore,
      homeForfeit: params.homeForfeit ?? false,
      awayForfeit: params.awayForfeit ?? false,
      overrideReason: reason,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      confirmedById: actor.id ?? null,
    },
  });

  await db.match.update({
    where: { id: matchId },
    data: { status: "CONFIRMED", version: { increment: 1 } },
  });

  await writeAudit(db, {
    actor,
    action: "report.override",
    entity: "GameReport",
    entityId: report.id,
    metadata: { matchId, reason, before, after: { ...params, actor: undefined } },
  });
}

/** Admin reschedule / postpone / cancel. */
export async function updateMatchSchedule(
  db: DbClient,
  params: {
    matchId: string;
    actor: ActorContext;
    kickoffAt?: Date;
    venueId?: string | null;
    status?: MatchStatus;
    reason?: string;
  },
): Promise<void> {
  const { matchId, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await loadMatch(db, matchId);
  const data: Prisma.MatchUpdateInput = { version: { increment: 1 } };
  if (params.kickoffAt) data.kickoffAt = params.kickoffAt;
  if (params.venueId !== undefined) {
    data.venue = params.venueId ? { connect: { id: params.venueId } } : { disconnect: true };
  }
  if (params.status) data.status = params.status;

  await db.match.update({ where: { id: matchId }, data });

  await writeAudit(db, {
    actor,
    action: "match.update",
    entity: "Match",
    entityId: matchId,
    metadata: {
      reason: params.reason ?? null,
      before: { kickoffAt: match.kickoffAt, status: match.status, venueId: match.venueId },
      after: {
        kickoffAt: params.kickoffAt ?? match.kickoffAt,
        status: params.status ?? match.status,
        venueId: params.venueId === undefined ? match.venueId : params.venueId,
      },
    },
  });
}

/** Admin assignment of a specific referee (bypasses self-assignment). */
export async function adminAssignReferee(
  db: DbClient,
  params: { matchId: string; refereeId: string | null; actor: ActorContext; reason?: string },
): Promise<void> {
  const { matchId, refereeId, actor } = params;
  if (!actor.isAdmin) throw new MatchError("Admin only.", 403, "NOT_YOUR_MATCH");

  const match = await loadMatch(db, matchId);

  await db.match.update({
    where: { id: matchId },
    data: {
      refereeId,
      assignedAt: refereeId ? new Date() : null,
      status: refereeId ? (match.status === "SCHEDULED" ? "ASSIGNED" : match.status) : "SCHEDULED",
      ...(refereeId ? {} : { lockedAt: null, lockedById: null, lockedByName: null }),
      version: { increment: 1 },
    },
  });

  await writeAudit(db, {
    actor,
    action: refereeId ? "match.admin_assign" : "match.force_unassign",
    entity: "Match",
    entityId: matchId,
    metadata: { previousRefereeId: match.refereeId, refereeId, reason: params.reason ?? null },
  });
}
