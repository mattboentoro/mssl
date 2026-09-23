import { Prisma, type PrismaClient, type ScoreAppeal } from "@prisma/client";

import { toAuditActor, writeAudit } from "@/lib/audit";
import { MatchError, overrideGameReport } from "@/lib/matches";
import { createNotifications as notifyUsers } from "@/lib/notifications";

export const MAX_APPEAL_REASON_LENGTH = 2_000;
export const MAX_APPEAL_DECISION_NOTE_LENGTH = 2_000;

const OFFICIAL_MATCH_STATUSES = ["REPORT_SUBMITTED", "CONFIRMED", "FORFEIT"];

export class ScoreAppealError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422,
    readonly code:
      | "FORBIDDEN"
      | "MATCH_NOT_FOUND"
      | "APPEAL_NOT_FOUND"
      | "NOT_ELIGIBLE"
      | "DUPLICATE_OPEN"
      | "VALIDATION_FAILED"
      | "RESULT_CHANGED"
      | "ALREADY_DECIDED",
  ) {
    super(message);
    this.name = "ScoreAppealError";
  }
}

export interface ScoreAppealActor {
  appUserId: string;
  email?: string | null;
  name?: string | null;
}

export interface SubmitScoreAppealInput {
  matchId: string;
  teamId: string;
  reason: string;
  requestedHomeScore: number;
  requestedAwayScore: number;
  requestedHomeForfeit?: boolean;
  requestedAwayForfeit?: boolean;
  actor: ScoreAppealActor;
}

function requiredText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length < 5) {
    throw new ScoreAppealError(`${label} must be at least 5 characters.`, 422, "VALIDATION_FAILED");
  }
  if (normalized.length > maxLength) {
    throw new ScoreAppealError(
      `${label} must be ${maxLength} characters or fewer.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return normalized;
}

function score(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 99) {
    throw new ScoreAppealError(
      `${label} must be a whole number from 0 to 99.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return value;
}

function validateResult(input: {
  requestedHomeScore: number;
  requestedAwayScore: number;
  requestedHomeForfeit?: boolean;
  requestedAwayForfeit?: boolean;
}) {
  const requestedHomeScore = score(input.requestedHomeScore, "Home score");
  const requestedAwayScore = score(input.requestedAwayScore, "Away score");
  const requestedHomeForfeit = Boolean(input.requestedHomeForfeit);
  const requestedAwayForfeit = Boolean(input.requestedAwayForfeit);
  if (
    requestedHomeForfeit &&
    requestedAwayForfeit &&
    (requestedHomeScore !== 0 || requestedAwayScore !== 0)
  ) {
    throw new ScoreAppealError(
      "A double forfeit must be requested as 0-0.",
      422,
      "VALIDATION_FAILED",
    );
  }
  return {
    requestedHomeScore,
    requestedAwayScore,
    requestedHomeForfeit,
    requestedAwayForfeit,
  };
}

async function requireActiveCaptain(
  tx: Prisma.TransactionClient,
  actorId: string,
  teamId: string,
  seasonId: string,
) {
  const assignment = await tx.teamCaptain.findFirst({
    where: {
      userId: actorId,
      teamId,
      seasonId,
      status: "ACTIVE",
      revokedAt: null,
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new ScoreAppealError(
      "Active Captain access for this participating team and season is required.",
      403,
      "FORBIDDEN",
    );
  }
}

async function requireAdmin(tx: Prisma.TransactionClient, actorId: string) {
  const assignment = await tx.globalRoleAssignment.findFirst({
    where: {
      userId: actorId,
      role: "ADMIN",
      revokedAt: null,
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
  if (!assignment) {
    throw new ScoreAppealError("Administrator access is required.", 403, "FORBIDDEN");
  }
}

async function participantRecipientIds(
  tx: Prisma.TransactionClient,
  match: { seasonId: string; homeTeamId: string; awayTeamId: string; refereeId: string | null },
) {
  const teamIds = [match.homeTeamId, match.awayTeamId];
  const [members, captains, referee] = await Promise.all([
    tx.teamMembership.findMany({
      where: {
        seasonId: match.seasonId,
        teamId: { in: teamIds },
        status: "ACTIVE",
        endedAt: null,
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    }),
    tx.teamCaptain.findMany({
      where: {
        seasonId: match.seasonId,
        teamId: { in: teamIds },
        status: "ACTIVE",
        revokedAt: null,
        userId: { not: null },
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    }),
    match.refereeId
      ? tx.referee.findUnique({ where: { id: match.refereeId }, select: { userId: true } })
      : null,
  ]);
  return [
    ...new Set(
      [
        ...members.map(({ userId }) => userId),
        ...captains.map(({ userId }) => userId),
        referee?.userId,
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
}

export async function submitScoreAppeal(
  db: PrismaClient,
  input: SubmitScoreAppealInput,
): Promise<ScoreAppeal> {
  const reason = requiredText(input.reason, "Appeal reason", MAX_APPEAL_REASON_LENGTH);
  const requested = validateResult(input);

  try {
    return await db.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: input.matchId },
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
          report: true,
        },
      });
      if (!match) {
        throw new ScoreAppealError("That match does not exist.", 404, "MATCH_NOT_FOUND");
      }
      if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) {
        throw new ScoreAppealError(
          "Only a participating team may appeal this result.",
          403,
          "FORBIDDEN",
        );
      }
      await requireActiveCaptain(tx, input.actor.appUserId, input.teamId, match.seasonId);
      if (!match.report || !OFFICIAL_MATCH_STATUSES.includes(match.status)) {
        throw new ScoreAppealError("Only an official result may be appealed.", 409, "NOT_ELIGIBLE");
      }

      const openKey = `${match.report.id}:${input.teamId}`;
      if (await tx.scoreAppeal.findUnique({ where: { openKey }, select: { id: true } })) {
        throw new ScoreAppealError(
          "Your team already has a pending appeal for this result.",
          409,
          "DUPLICATE_OPEN",
        );
      }

      const appeal = await tx.scoreAppeal.create({
        data: {
          matchId: match.id,
          teamId: input.teamId,
          submittedById: input.actor.appUserId,
          reason,
          originalReportId: match.report.id,
          originalMatchVersion: match.version,
          originalMatchStatus: match.status,
          originalReportUpdatedAt: match.report.updatedAt,
          originalHomeScore: match.report.homeScore,
          originalAwayScore: match.report.awayScore,
          originalHomeForfeit: match.report.homeForfeit,
          originalAwayForfeit: match.report.awayForfeit,
          ...requested,
          openKey,
        },
      });
      await writeAudit(tx, {
        actor: toAuditActor(input.actor, "captain"),
        action: "score_appeal.submit",
        entity: "ScoreAppeal",
        entityId: appeal.id,
        metadata: {
          matchId: match.id,
          teamId: input.teamId,
          reason,
          original: {
            homeScore: match.report.homeScore,
            awayScore: match.report.awayScore,
            homeForfeit: match.report.homeForfeit,
            awayForfeit: match.report.awayForfeit,
          },
          requested,
        },
      });

      const admins = await tx.globalRoleAssignment.findMany({
        where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
        select: { userId: true },
      });
      await notifyUsers(tx, [...new Set(admins.map(({ userId }) => userId))], {
        type: "SCORE_APPEAL_SUBMITTED",
        title: "Score appeal submitted",
        body: `${match.homeTeam.name} v ${match.awayTeam.name} has a new score appeal.`,
        href: "/schedule",
      });
      return appeal;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ScoreAppealError(
        "Your team already has a pending appeal for this result.",
        409,
        "DUPLICATE_OPEN",
      );
    }
    throw error;
  }
}

export async function cancelScoreAppeal(
  db: PrismaClient,
  input: { appealId: string; actor: ScoreAppealActor },
): Promise<void> {
  await db.$transaction(async (tx) => {
    const appeal = await tx.scoreAppeal.findUnique({
      where: { id: input.appealId },
      include: { match: { select: { seasonId: true } } },
    });
    if (!appeal) {
      throw new ScoreAppealError("Appeal not found.", 404, "APPEAL_NOT_FOUND");
    }
    await requireActiveCaptain(tx, input.actor.appUserId, appeal.teamId, appeal.match.seasonId);
    const updated = await tx.scoreAppeal.updateMany({
      where: { id: appeal.id, status: "PENDING", openKey: { not: null } },
      data: { status: "CANCELLED", openKey: null, decidedAt: new Date() },
    });
    if (!updated.count) {
      throw new ScoreAppealError("Only a pending appeal can be cancelled.", 409, "ALREADY_DECIDED");
    }
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "captain"),
      action: "score_appeal.cancel",
      entity: "ScoreAppeal",
      entityId: appeal.id,
      metadata: { matchId: appeal.matchId, teamId: appeal.teamId },
    });
  });
}

export async function rejectScoreAppeal(
  db: PrismaClient,
  input: { appealId: string; resolutionNote: string; actor: ScoreAppealActor },
): Promise<void> {
  const note = requiredText(
    input.resolutionNote,
    "Resolution note",
    MAX_APPEAL_DECISION_NOTE_LENGTH,
  );
  await db.$transaction(async (tx) => {
    await requireAdmin(tx, input.actor.appUserId);
    const appeal = await tx.scoreAppeal.findUnique({
      where: { id: input.appealId },
      include: {
        match: {
          include: {
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    });
    if (!appeal) {
      throw new ScoreAppealError("Appeal not found.", 404, "APPEAL_NOT_FOUND");
    }
    const updated = await tx.scoreAppeal.updateMany({
      where: { id: appeal.id, status: "PENDING", openKey: { not: null } },
      data: {
        status: "REJECTED",
        openKey: null,
        decidedById: input.actor.appUserId,
        decisionNote: note,
        decidedAt: new Date(),
      },
    });
    if (!updated.count) {
      throw new ScoreAppealError("This appeal is no longer pending.", 409, "ALREADY_DECIDED");
    }
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "admin"),
      action: "score_appeal.reject",
      entity: "ScoreAppeal",
      entityId: appeal.id,
      metadata: { matchId: appeal.matchId, teamId: appeal.teamId, resolutionNote: note },
    });
    await notifyUsers(tx, await participantRecipientIds(tx, appeal.match), {
      type: "SCORE_APPEAL_REJECTED",
      title: "Score appeal rejected",
      body: `The appeal for ${appeal.match.homeTeam.name} v ${appeal.match.awayTeam.name} was rejected: ${note}`,
      href: "/schedule",
    });
  });
}

export async function acceptScoreAppeal(
  db: PrismaClient,
  input: { appealId: string; resolutionNote: string; actor: ScoreAppealActor },
): Promise<void> {
  const note = requiredText(
    input.resolutionNote,
    "Resolution note",
    MAX_APPEAL_DECISION_NOTE_LENGTH,
  );
  await db.$transaction(async (tx) => {
    await requireAdmin(tx, input.actor.appUserId);
    const appeal = await tx.scoreAppeal.findUnique({
      where: { id: input.appealId },
      include: {
        match: {
          include: {
            report: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
          },
        },
      },
    });
    if (!appeal) {
      throw new ScoreAppealError("Appeal not found.", 404, "APPEAL_NOT_FOUND");
    }
    if (appeal.status !== "PENDING" || !appeal.openKey) {
      throw new ScoreAppealError("This appeal is no longer pending.", 409, "ALREADY_DECIDED");
    }
    const report = appeal.match.report;
    if (
      !report ||
      report.id !== appeal.originalReportId ||
      appeal.match.version !== appeal.originalMatchVersion ||
      appeal.match.status !== appeal.originalMatchStatus ||
      report.updatedAt.getTime() !== appeal.originalReportUpdatedAt.getTime() ||
      report.homeScore !== appeal.originalHomeScore ||
      report.awayScore !== appeal.originalAwayScore ||
      report.homeForfeit !== appeal.originalHomeForfeit ||
      report.awayForfeit !== appeal.originalAwayForfeit
    ) {
      throw new ScoreAppealError(
        "The official result changed after this appeal was submitted. Review the new result before deciding.",
        409,
        "RESULT_CHANGED",
      );
    }

    const claimed = await tx.scoreAppeal.updateMany({
      where: { id: appeal.id, status: "PENDING", openKey: appeal.openKey },
      data: {
        status: "ACCEPTED",
        openKey: null,
        decidedById: input.actor.appUserId,
        decisionNote: note,
        decidedAt: new Date(),
      },
    });
    if (!claimed.count) {
      throw new ScoreAppealError("This appeal is no longer pending.", 409, "ALREADY_DECIDED");
    }

    try {
      await overrideGameReport(tx, {
        matchId: appeal.matchId,
        actor: { ...toAuditActor(input.actor, "admin"), isAdmin: true },
        reason: `Accepted score appeal ${appeal.id}: ${note}`,
        homeScore: appeal.requestedHomeScore,
        awayScore: appeal.requestedAwayScore,
        homeForfeit: appeal.requestedHomeForfeit,
        awayForfeit: appeal.requestedAwayForfeit,
        expectedMatchVersion: appeal.originalMatchVersion,
        expectedReportId: appeal.originalReportId,
        expectedReportUpdatedAt: appeal.originalReportUpdatedAt,
      });
    } catch (error) {
      if (error instanceof MatchError && error.code === "VERSION_CONFLICT") {
        throw new ScoreAppealError(
          "The official result changed while this appeal was being decided.",
          409,
          "RESULT_CHANGED",
        );
      }
      throw error;
    }
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "admin"),
      action: "score_appeal.accept",
      entity: "ScoreAppeal",
      entityId: appeal.id,
      metadata: {
        matchId: appeal.matchId,
        teamId: appeal.teamId,
        resolutionNote: note,
        requested: {
          homeScore: appeal.requestedHomeScore,
          awayScore: appeal.requestedAwayScore,
          homeForfeit: appeal.requestedHomeForfeit,
          awayForfeit: appeal.requestedAwayForfeit,
        },
      },
    });
    await notifyUsers(tx, await participantRecipientIds(tx, appeal.match), {
      type: "SCORE_APPEAL_ACCEPTED",
      title: "Score appeal accepted",
      body: `The result for ${appeal.match.homeTeam.name} v ${appeal.match.awayTeam.name} was corrected: ${note}`,
      href: "/schedule",
    });
  });
}

export async function listScoreAppealsForCaptain(db: PrismaClient, appUserId: string) {
  const assignments = await db.teamCaptain.findMany({
    where: {
      userId: appUserId,
      status: "ACTIVE",
      revokedAt: null,
      seasonId: { not: null },
      user: { status: "ACTIVE" },
    },
    select: { seasonId: true, teamId: true },
  });
  if (!assignments.length) return { eligible: [], appeals: [] };

  const contexts = assignments.flatMap((assignment) =>
    assignment.seasonId ? [{ seasonId: assignment.seasonId, teamId: assignment.teamId }] : [],
  );
  const eligible = await db.match.findMany({
    where: {
      OR: contexts.map(({ seasonId, teamId }) => ({
        seasonId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      })),
      status: { in: OFFICIAL_MATCH_STATUSES },
      report: { isNot: null },
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      report: true,
      scoreAppeals: { where: { status: "PENDING" }, select: { teamId: true } },
    },
    orderBy: { kickoffAt: "desc" },
  });
  const appealable = eligible.flatMap((match) =>
    contexts
      .filter(
        ({ seasonId, teamId }) =>
          seasonId === match.seasonId &&
          (teamId === match.homeTeamId || teamId === match.awayTeamId) &&
          !match.scoreAppeals.some((appeal) => appeal.teamId === teamId),
      )
      .map(({ teamId }) => ({ ...match, teamId })),
  );
  const appeals = await db.scoreAppeal.findMany({
    where: {
      OR: contexts.map(({ seasonId, teamId }) => ({ teamId, match: { seasonId } })),
    },
    include: {
      team: { select: { name: true } },
      submittedBy: { select: { displayName: true } },
      match: {
        include: {
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return { eligible: appealable, appeals };
}
