import { Prisma, type PrismaClient, type RescheduleRequest } from "@prisma/client";

import { writeAudit } from "@/lib/audit";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const MAX_RESCHEDULE_REASON_LENGTH = 2_000;
export const MAX_RESCHEDULE_NOTE_LENGTH = 2_000;
export const OPEN_RESCHEDULE_STATUSES = ["PENDING_OPPONENT", "PENDING_ADMIN"] as const;
const ELIGIBLE_MATCH_STATUSES = ["SCHEDULED", "ASSIGNED"] as const;

export class RescheduleError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422,
    readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "VERSION_CONFLICT"
      | "TRANSITION_CONFLICT"
      | "DUPLICATE_OPEN_REQUEST"
      | "VALIDATION_FAILED",
  ) {
    super(message);
    this.name = "RescheduleError";
  }
}

export interface RescheduleActor {
  appUserId: string;
  email?: string | null;
  name?: string | null;
  isAdmin?: boolean;
}

function actorForAudit(actor: RescheduleActor, role: "captain" | "admin") {
  return { id: actor.appUserId, email: actor.email, name: actor.name, role };
}

function requiredText(value: string | null | undefined, label: string, maximum: number): string {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new RescheduleError(`${label} is required.`, 422, "VALIDATION_FAILED");
  }
  if (normalized.length > maximum) {
    throw new RescheduleError(
      `${label} must be ${maximum} characters or fewer.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return normalized;
}

function optionalText(value: string | null | undefined, maximum: number): string | null {
  const normalized = value?.trim() ?? "";
  if (normalized.length > maximum) {
    throw new RescheduleError(
      `Venue must be ${maximum} characters or fewer.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return normalized || null;
}

function validateKickoff(value: Date, now: Date): Date {
  if (Number.isNaN(value.getTime()) || value.getTime() <= now.getTime()) {
    throw new RescheduleError(
      "The proposed kickoff must be a valid future date and time.",
      422,
      "VALIDATION_FAILED",
    );
  }
  return value;
}

async function requireActiveCaptain(
  db: DbClient,
  actorId: string,
  seasonId: string,
  teamId: string,
) {
  const captain = await db.teamCaptain.findFirst({
    where: {
      userId: actorId,
      seasonId,
      teamId,
      status: "ACTIVE",
      revokedAt: null,
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!captain) {
    throw new RescheduleError(
      "Active Captain access for this team and season is required.",
      403,
      "FORBIDDEN",
    );
  }
}

async function activeCaptainIds(db: DbClient, seasonId: string, teamIds: string[]) {
  const rows = await db.teamCaptain.findMany({
    where: {
      seasonId,
      teamId: { in: teamIds },
      status: "ACTIVE",
      revokedAt: null,
      userId: { not: null },
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  return [...new Set(rows.flatMap(({ userId }) => (userId ? [userId] : [])))];
}

async function activeTeamUserIds(db: DbClient, seasonId: string, teamIds: string[]) {
  const [captains, members] = await Promise.all([
    activeCaptainIds(db, seasonId, teamIds),
    db.teamMembership.findMany({
      where: {
        seasonId,
        teamId: { in: teamIds },
        status: "ACTIVE",
        endedAt: null,
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...captains, ...members.map(({ userId }) => userId)])];
}

async function notify(
  db: DbClient,
  userIds: string[],
  input: { type: string; title: string; body: string; requestId: string },
) {
  const recipients = [...new Set(userIds)];
  if (!recipients.length) return;
  await db.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: `/captain/reschedules#request-${encodeURIComponent(input.requestId)}`,
    })),
  });
}

async function runTransaction<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  return db.$transaction(operation);
}

export async function proposeReschedule(
  db: PrismaClient,
  input: {
    matchId: string;
    requestingTeamId: string;
    proposedKickoffAt: Date;
    proposedVenueName?: string | null;
    reason: string;
    actor: RescheduleActor;
    now?: Date;
  },
): Promise<RescheduleRequest> {
  const now = input.now ?? new Date();
  const proposedKickoffAt = validateKickoff(input.proposedKickoffAt, now);
  const proposedVenueName = optionalText(input.proposedVenueName, 300);
  const reason = requiredText(input.reason, "Rationale", MAX_RESCHEDULE_REASON_LENGTH);

  return runTransaction(db, async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { report: { select: { id: true } }, homeTeam: true, awayTeam: true },
    });
    if (!match) throw new RescheduleError("That fixture does not exist.", 404, "NOT_FOUND");
    if (
      !ELIGIBLE_MATCH_STATUSES.includes(match.status as (typeof ELIGIBLE_MATCH_STATUSES)[number]) ||
      match.report ||
      match.kickoffAt.getTime() <= now.getTime()
    ) {
      throw new RescheduleError(
        "Only a future, unfinished scheduled fixture can be rescheduled.",
        409,
        "INVALID_STATE",
      );
    }
    if (
      input.requestingTeamId !== match.homeTeamId &&
      input.requestingTeamId !== match.awayTeamId
    ) {
      throw new RescheduleError(
        "Only a participating team may propose a change.",
        403,
        "FORBIDDEN",
      );
    }
    await requireActiveCaptain(tx, input.actor.appUserId, match.seasonId, input.requestingTeamId);
    const duplicate = await tx.rescheduleRequest.findFirst({
      where: { matchId: match.id, status: { in: [...OPEN_RESCHEDULE_STATUSES] } },
      select: { id: true },
    });
    if (duplicate) {
      throw new RescheduleError(
        "This fixture already has an open reschedule request.",
        409,
        "DUPLICATE_OPEN_REQUEST",
      );
    }

    let request: RescheduleRequest;
    try {
      request = await tx.rescheduleRequest.create({
        data: {
          matchId: match.id,
          requestingTeamId: input.requestingTeamId,
          requestedById: input.actor.appUserId,
          proposedKickoffAt,
          proposedVenueName,
          reason,
          originalKickoffAt: match.kickoffAt,
          originalVenueName: match.venueName,
          expectedMatchVersion: match.version,
          openMatchKey: match.id,
          status: "PENDING_OPPONENT",
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new RescheduleError(
          "This fixture already has an open reschedule request.",
          409,
          "DUPLICATE_OPEN_REQUEST",
        );
      }
      throw error;
    }
    const opponentId =
      match.homeTeamId === input.requestingTeamId ? match.awayTeamId : match.homeTeamId;
    await notify(tx, await activeCaptainIds(tx, match.seasonId, [opponentId]), {
      type: "RESCHEDULE_PROPOSED",
      title: "Reschedule response needed",
      body: `${match.homeTeam.name} v ${match.awayTeam.name} has a proposed new kickoff.`,
      requestId: request.id,
    });
    await writeAudit(tx, {
      actor: actorForAudit(input.actor, "captain"),
      action: "reschedule.propose",
      entity: "RescheduleRequest",
      entityId: request.id,
      metadata: {
        matchId: match.id,
        requestingTeamId: input.requestingTeamId,
        expectedMatchVersion: match.version,
        originalKickoffAt: match.kickoffAt,
        originalVenueName: match.venueName,
        proposedKickoffAt,
        proposedVenueName,
        reason,
      },
    });
    return request;
  });
}

export async function reviseReschedule(
  db: PrismaClient,
  input: {
    requestId: string;
    proposedKickoffAt: Date;
    proposedVenueName?: string | null;
    reason: string;
    actor: RescheduleActor;
    now?: Date;
  },
): Promise<RescheduleRequest> {
  const now = input.now ?? new Date();
  const proposedKickoffAt = validateKickoff(input.proposedKickoffAt, now);
  const proposedVenueName = optionalText(input.proposedVenueName, 300);
  const reason = requiredText(input.reason, "Rationale", MAX_RESCHEDULE_REASON_LENGTH);
  return runTransaction(db, async (tx) => {
    const request = await tx.rescheduleRequest.findUnique({
      where: { id: input.requestId },
      include: { match: { include: { homeTeam: true, awayTeam: true, report: true } } },
    });
    if (!request) throw new RescheduleError("Request not found.", 404, "NOT_FOUND");
    if (request.requestedById !== input.actor.appUserId) {
      throw new RescheduleError("Only the proposer may revise this request.", 403, "FORBIDDEN");
    }
    await requireActiveCaptain(
      tx,
      input.actor.appUserId,
      request.match.seasonId,
      request.requestingTeamId,
    );
    if (request.status !== "PENDING_OPPONENT") {
      throw new RescheduleError(
        "A request can be revised only while awaiting the opponent.",
        409,
        "INVALID_STATE",
      );
    }
    if (
      request.expectedMatchVersion !== request.match.version ||
      request.match.report ||
      !ELIGIBLE_MATCH_STATUSES.includes(
        request.match.status as (typeof ELIGIBLE_MATCH_STATUSES)[number],
      ) ||
      request.match.kickoffAt.getTime() <= now.getTime()
    ) {
      throw new RescheduleError(
        "The fixture changed; create a fresh request.",
        409,
        "VERSION_CONFLICT",
      );
    }
    const updated = await tx.rescheduleRequest.updateMany({
      where: {
        id: request.id,
        status: "PENDING_OPPONENT",
        expectedMatchVersion: request.expectedMatchVersion,
        updatedAt: request.updatedAt,
      },
      data: { proposedKickoffAt, proposedVenueName, reason },
    });
    if (updated.count !== 1) {
      throw new RescheduleError(
        "This request changed while you were revising it. Refresh and try again.",
        409,
        "TRANSITION_CONFLICT",
      );
    }
    const saved = await tx.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    const opponentId =
      request.match.homeTeamId === request.requestingTeamId
        ? request.match.awayTeamId
        : request.match.homeTeamId;
    await notify(tx, await activeCaptainIds(tx, request.match.seasonId, [opponentId]), {
      type: "RESCHEDULE_REVISED",
      title: "Reschedule proposal revised",
      body: `${request.match.homeTeam.name} v ${request.match.awayTeam.name} has a revised proposal.`,
      requestId: request.id,
    });
    await writeAudit(tx, {
      actor: actorForAudit(input.actor, "captain"),
      action: "reschedule.revise",
      entity: "RescheduleRequest",
      entityId: request.id,
      metadata: {
        before: {
          proposedKickoffAt: request.proposedKickoffAt,
          proposedVenueName: request.proposedVenueName,
          reason: request.reason,
        },
        after: { proposedKickoffAt, proposedVenueName, reason },
      },
    });
    return saved;
  });
}

export async function cancelReschedule(
  db: PrismaClient,
  input: { requestId: string; actor: RescheduleActor },
): Promise<RescheduleRequest> {
  return runTransaction(db, async (tx) => {
    const request = await tx.rescheduleRequest.findUnique({
      where: { id: input.requestId },
      include: { match: { include: { homeTeam: true, awayTeam: true } } },
    });
    if (!request) throw new RescheduleError("Request not found.", 404, "NOT_FOUND");
    if (request.requestedById !== input.actor.appUserId) {
      throw new RescheduleError("Only the proposer may cancel this request.", 403, "FORBIDDEN");
    }
    await requireActiveCaptain(
      tx,
      input.actor.appUserId,
      request.match.seasonId,
      request.requestingTeamId,
    );
    if (request.status !== "PENDING_OPPONENT") {
      throw new RescheduleError(
        "A request can be cancelled only while awaiting the opponent.",
        409,
        "INVALID_STATE",
      );
    }
    const updated = await tx.rescheduleRequest.updateMany({
      where: {
        id: request.id,
        status: "PENDING_OPPONENT",
        expectedMatchVersion: request.expectedMatchVersion,
        updatedAt: request.updatedAt,
      },
      data: { status: "CANCELLED", openMatchKey: null },
    });
    if (updated.count !== 1) {
      throw new RescheduleError(
        "This request changed before it could be cancelled. Refresh and try again.",
        409,
        "TRANSITION_CONFLICT",
      );
    }
    const saved = await tx.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    const opponentId =
      request.match.homeTeamId === request.requestingTeamId
        ? request.match.awayTeamId
        : request.match.homeTeamId;
    await notify(tx, await activeCaptainIds(tx, request.match.seasonId, [opponentId]), {
      type: "RESCHEDULE_CANCELLED",
      title: "Reschedule request cancelled",
      body: `${request.match.homeTeam.name} v ${request.match.awayTeam.name} is no longer awaiting a response.`,
      requestId: request.id,
    });
    await writeAudit(tx, {
      actor: actorForAudit(input.actor, "captain"),
      action: "reschedule.cancel",
      entity: "RescheduleRequest",
      entityId: request.id,
      metadata: { matchId: request.matchId },
    });
    return saved;
  });
}

export async function respondToReschedule(
  db: PrismaClient,
  input: {
    requestId: string;
    approve: boolean;
    responseNote?: string | null;
    actor: RescheduleActor;
  },
): Promise<RescheduleRequest> {
  const responseNote = optionalText(input.responseNote, MAX_RESCHEDULE_NOTE_LENGTH);
  return runTransaction(db, async (tx) => {
    const request = await tx.rescheduleRequest.findUnique({
      where: { id: input.requestId },
      include: { match: { include: { homeTeam: true, awayTeam: true } } },
    });
    if (!request) throw new RescheduleError("Request not found.", 404, "NOT_FOUND");
    if (request.status !== "PENDING_OPPONENT") {
      throw new RescheduleError(
        "This request is no longer awaiting the opponent.",
        409,
        "INVALID_STATE",
      );
    }
    const opponentId =
      request.match.homeTeamId === request.requestingTeamId
        ? request.match.awayTeamId
        : request.match.homeTeamId;
    await requireActiveCaptain(tx, input.actor.appUserId, request.match.seasonId, opponentId);
    if (opponentId === request.requestingTeamId) {
      throw new RescheduleError("The proposing team cannot confirm itself.", 403, "FORBIDDEN");
    }

    const status = input.approve ? "PENDING_ADMIN" : "REJECTED_OPPONENT";
    const updated = await tx.rescheduleRequest.updateMany({
      where: {
        id: request.id,
        status: "PENDING_OPPONENT",
        expectedMatchVersion: request.expectedMatchVersion,
        updatedAt: request.updatedAt,
      },
      data: {
        status,
        openMatchKey: input.approve ? request.matchId : null,
        respondedById: input.actor.appUserId,
        responseNote,
        respondedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      throw new RescheduleError(
        "This request was answered by someone else. Refresh to see the latest status.",
        409,
        "TRANSITION_CONFLICT",
      );
    }
    const saved = await tx.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
    const recipientIds = input.approve
      ? (
          await tx.globalRoleAssignment.findMany({
            where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
            select: { userId: true },
          })
        ).map(({ userId }) => userId)
      : await activeCaptainIds(tx, request.match.seasonId, [request.requestingTeamId]);
    await notify(tx, recipientIds, {
      type: input.approve ? "RESCHEDULE_AWAITING_ADMIN" : "RESCHEDULE_REJECTED",
      title: input.approve ? "Reschedule needs league review" : "Reschedule declined",
      body: `${request.match.homeTeam.name} v ${request.match.awayTeam.name}`,
      requestId: request.id,
    });
    await writeAudit(tx, {
      actor: actorForAudit(input.actor, "captain"),
      action: input.approve ? "reschedule.opponent_approve" : "reschedule.opponent_reject",
      entity: "RescheduleRequest",
      entityId: request.id,
      metadata: { matchId: request.matchId, responseNote },
    });
    return saved;
  });
}

export async function reviewRescheduleAsAdmin(
  db: PrismaClient,
  input: {
    requestId: string;
    approve: boolean;
    reviewNote?: string | null;
    actor: RescheduleActor;
    now?: Date;
  },
): Promise<RescheduleRequest> {
  if (!input.actor.isAdmin) {
    throw new RescheduleError("Administrator access is required.", 403, "FORBIDDEN");
  }
  const reviewNote = optionalText(input.reviewNote, MAX_RESCHEDULE_NOTE_LENGTH);
  const now = input.now ?? new Date();
  return runTransaction(db, async (tx) => {
    const request = await tx.rescheduleRequest.findUnique({
      where: { id: input.requestId },
      include: {
        match: {
          include: {
            homeTeam: true,
            awayTeam: true,
            report: { select: { id: true } },
            referee: { select: { userId: true } },
          },
        },
      },
    });
    if (!request) throw new RescheduleError("Request not found.", 404, "NOT_FOUND");
    if (request.status !== "PENDING_ADMIN") {
      throw new RescheduleError(
        "This request is not awaiting league review.",
        409,
        "INVALID_STATE",
      );
    }

    if (input.approve) {
      if (
        request.expectedMatchVersion === null ||
        request.originalKickoffAt === null ||
        request.proposedKickoffAt === null ||
        request.expectedMatchVersion !== request.match.version
      ) {
        throw new RescheduleError(
          "The fixture changed after this request was proposed.",
          409,
          "VERSION_CONFLICT",
        );
      }
      if (
        request.match.report ||
        !ELIGIBLE_MATCH_STATUSES.includes(
          request.match.status as (typeof ELIGIBLE_MATCH_STATUSES)[number],
        ) ||
        request.match.kickoffAt.getTime() <= now.getTime() ||
        request.proposedKickoffAt.getTime() <= now.getTime()
      ) {
        throw new RescheduleError(
          "The fixture is no longer eligible for rescheduling.",
          409,
          "INVALID_STATE",
        );
      }
      const changed = await tx.match.updateMany({
        where: {
          id: request.matchId,
          version: request.expectedMatchVersion,
          status: { in: [...ELIGIBLE_MATCH_STATUSES] },
          report: { is: null },
        },
        data: {
          kickoffAt: request.proposedKickoffAt,
          venueName: request.proposedVenueName ?? request.match.venueName,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        throw new RescheduleError(
          "The fixture changed after this request was proposed.",
          409,
          "VERSION_CONFLICT",
        );
      }
    }

    const status = input.approve ? "APPROVED" : "REJECTED_ADMIN";
    const reviewed = await tx.rescheduleRequest.updateMany({
      where: {
        id: request.id,
        status: "PENDING_ADMIN",
        expectedMatchVersion: request.expectedMatchVersion,
        updatedAt: request.updatedAt,
      },
      data: {
        status,
        openMatchKey: null,
        adminReviewedById: input.actor.appUserId,
        adminReviewNote: reviewNote,
        adminReviewedAt: now,
      },
    });
    if (reviewed.count !== 1) {
      throw new RescheduleError(
        "This request changed while it was being reviewed. Refresh and try again.",
        409,
        "TRANSITION_CONFLICT",
      );
    }
    const recipientIds = await activeTeamUserIds(tx, request.match.seasonId, [
      request.match.homeTeamId,
      request.match.awayTeamId,
    ]);
    if (request.match.referee?.userId) recipientIds.push(request.match.referee.userId);
    await notify(tx, recipientIds, {
      type: input.approve ? "RESCHEDULE_APPROVED" : "RESCHEDULE_REJECTED",
      title: input.approve ? "Reschedule approved" : "Reschedule rejected by league",
      body: `${request.match.homeTeam.name} v ${request.match.awayTeam.name}`,
      requestId: request.id,
    });
    await writeAudit(tx, {
      actor: actorForAudit(input.actor, "admin"),
      action: input.approve ? "reschedule.admin_approve" : "reschedule.admin_reject",
      entity: "RescheduleRequest",
      entityId: request.id,
      metadata: {
        matchId: request.matchId,
        reviewNote,
        expectedMatchVersion: request.expectedMatchVersion,
        before: {
          kickoffAt: request.originalKickoffAt,
          venueName: request.originalVenueName,
          status: request.match.status,
          refereeId: request.match.refereeId,
          assignedAt: request.match.assignedAt,
        },
        after: input.approve
          ? {
              kickoffAt: request.proposedKickoffAt,
              venueName: request.proposedVenueName ?? request.match.venueName,
              status: request.match.status,
              refereeId: request.match.refereeId,
              assignedAt: request.match.assignedAt,
              version: request.match.version + 1,
            }
          : null,
      },
    });
    return tx.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
}

export async function listReschedulesForCaptain(db: PrismaClient, appUserId: string) {
  const assignments = await db.teamCaptain.findMany({
    where: {
      userId: appUserId,
      status: "ACTIVE",
      revokedAt: null,
      seasonId: { not: null },
    },
    select: { seasonId: true, teamId: true },
  });
  const contexts = assignments.flatMap(({ seasonId, teamId }) =>
    seasonId ? [{ seasonId, teamId }] : [],
  );
  if (!contexts.length) return { eligibleMatches: [], requests: [], contexts };
  const matches = await db.match.findMany({
    where: {
      OR: contexts.map(({ seasonId, teamId }) => ({
        seasonId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      })),
    },
    include: { homeTeam: true, awayTeam: true, report: { select: { id: true } } },
    orderBy: { kickoffAt: "asc" },
  });
  const now = new Date();
  const eligibleMatches = matches.filter(
    (match) =>
      match.kickoffAt > now &&
      !match.report &&
      ELIGIBLE_MATCH_STATUSES.includes(match.status as (typeof ELIGIBLE_MATCH_STATUSES)[number]),
  );
  const requests = await db.rescheduleRequest.findMany({
    where: {
      match: {
        OR: contexts.map(({ seasonId, teamId }) => ({
          seasonId,
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        })),
      },
    },
    include: {
      match: { include: { homeTeam: true, awayTeam: true } },
      requestingTeam: true,
      requestedBy: { select: { displayName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return { eligibleMatches, requests, contexts };
}
