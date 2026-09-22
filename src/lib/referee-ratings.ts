import type { PrismaClient, RefereeRating } from "@prisma/client";

import { writeAudit } from "@/lib/audit";

export const MAX_RATING_COMMENT_LENGTH = 1000;

export class RatingError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422,
    readonly code: "FORBIDDEN" | "MATCH_NOT_FOUND" | "RATING_NOT_ELIGIBLE" | "VALIDATION_FAILED",
  ) {
    super(message);
    this.name = "RatingError";
  }
}

export interface RatingActor {
  appUserId: string;
  email?: string | null;
  name?: string | null;
}

export interface SaveRefereeRatingInput {
  matchId: string;
  teamId: string;
  rating: number;
  comment?: string | null;
  actor: RatingActor;
}

export interface RefereeRatingAggregate {
  average: number | null;
  count: number;
}

function normalizeRating(rating: number): number {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new RatingError(
      "Choose a whole-number rating from 1 to 5 stars.",
      422,
      "VALIDATION_FAILED",
    );
  }
  return rating;
}

function normalizeComment(comment: string | null | undefined): string | null {
  const normalized = comment?.trim() ?? "";
  if (normalized.length > MAX_RATING_COMMENT_LENGTH) {
    throw new RatingError(
      `Private comments must be ${MAX_RATING_COMMENT_LENGTH} characters or fewer.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return normalized || null;
}

/**
 * Create or replace a participating team's single rating for a match.
 *
 * Authorization and result eligibility are intentionally repeated inside the
 * transaction. A stale page or a forged action cannot race a captain
 * revocation, report reopening, or referee reassignment.
 */
export async function saveRefereeRating(
  db: PrismaClient,
  input: SaveRefereeRatingInput,
): Promise<RefereeRating> {
  const rating = normalizeRating(input.rating);
  const comment = normalizeComment(input.comment);

  return db.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      select: {
        id: true,
        seasonId: true,
        homeTeamId: true,
        awayTeamId: true,
        refereeId: true,
        status: true,
        report: { select: { refereeId: true } },
      },
    });
    if (!match) {
      throw new RatingError("That match does not exist.", 404, "MATCH_NOT_FOUND");
    }
    if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) {
      throw new RatingError(
        "Only a participating team can rate this match's referee.",
        403,
        "FORBIDDEN",
      );
    }

    const captain = await tx.teamCaptain.findFirst({
      where: {
        userId: input.actor.appUserId,
        teamId: input.teamId,
        seasonId: match.seasonId,
        status: "ACTIVE",
        revokedAt: null,
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!captain) {
      throw new RatingError(
        "Active Captain access for this team and season is required.",
        403,
        "FORBIDDEN",
      );
    }

    if (
      !match.refereeId ||
      match.report?.refereeId !== match.refereeId ||
      !["REPORT_SUBMITTED", "CONFIRMED", "FORFEIT"].includes(match.status)
    ) {
      throw new RatingError(
        "A rating can be submitted only after the assigned referee files the official result.",
        409,
        "RATING_NOT_ELIGIBLE",
      );
    }
    const refereeId = match.refereeId;

    const key = { matchId_teamId: { matchId: match.id, teamId: input.teamId } };
    const previous = await tx.refereeRating.findUnique({ where: key });
    const saved = await tx.refereeRating.upsert({
      where: key,
      create: {
        matchId: match.id,
        refereeId,
        teamId: input.teamId,
        ratedById: input.actor.appUserId,
        rating,
        comment,
      },
      update: {
        refereeId,
        ratedById: input.actor.appUserId,
        rating,
        comment,
      },
    });

    await writeAudit(tx, {
      actor: {
        id: input.actor.appUserId,
        email: input.actor.email,
        name: input.actor.name,
        role: "captain",
      },
      action: previous ? "referee_rating.update" : "referee_rating.create",
      entity: "RefereeRating",
      entityId: saved.id,
      metadata: {
        matchId: match.id,
        refereeId,
        teamId: input.teamId,
        before: previous
          ? { rating: previous.rating, comment: previous.comment, ratedById: previous.ratedById }
          : null,
        after: { rating, comment, ratedById: input.actor.appUserId },
      },
    });

    return saved;
  });
}

export async function getRefereeRatingAggregate(
  db: PrismaClient,
  refereeId: string,
): Promise<RefereeRatingAggregate> {
  const aggregate = await db.refereeRating.aggregate({
    where: {
      refereeId,
      match: {
        status: { in: ["REPORT_SUBMITTED", "CONFIRMED", "FORFEIT"] },
        report: { is: { refereeId } },
      },
    },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return {
    average: aggregate._avg.rating,
    count: aggregate._count._all,
  };
}

export async function listRefereeRatingsForAdmin(db: PrismaClient) {
  return db.refereeRating.findMany({
    include: {
      ratedBy: { select: { id: true, displayName: true, email: true } },
      team: { select: { id: true, name: true } },
      referee: { select: { id: true, name: true, email: true } },
      match: {
        select: {
          id: true,
          kickoffAt: true,
          homeTeam: { select: { name: true } },
          awayTeam: { select: { name: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function listRateableMatchesForCaptain(db: PrismaClient, appUserId: string) {
  const assignments = await db.teamCaptain.findMany({
    where: {
      userId: appUserId,
      status: "ACTIVE",
      revokedAt: null,
      seasonId: { not: null },
    },
    select: { seasonId: true, teamId: true },
  });
  const contexts = assignments.flatMap((assignment) =>
    assignment.seasonId ? [{ seasonId: assignment.seasonId, teamId: assignment.teamId }] : [],
  );
  if (contexts.length === 0) return [];

  const matches = await db.match.findMany({
    where: {
      OR: contexts.map(({ seasonId, teamId }) => ({
        seasonId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      })),
      refereeId: { not: null },
      status: { in: ["REPORT_SUBMITTED", "CONFIRMED", "FORFEIT"] },
      report: { is: { refereeId: { not: null } } },
    },
    include: {
      homeTeam: { select: { id: true, name: true } },
      awayTeam: { select: { id: true, name: true } },
      referee: { select: { id: true, name: true } },
      report: { select: { refereeId: true } },
      refereeRatings: true,
    },
    orderBy: { kickoffAt: "desc" },
  });

  return matches.flatMap((match) => {
    if (!match.refereeId || match.report?.refereeId !== match.refereeId || !match.referee)
      return [];
    const referee = match.referee;
    return contexts
      .filter(
        ({ seasonId, teamId }) =>
          seasonId === match.seasonId &&
          (teamId === match.homeTeamId || teamId === match.awayTeamId),
      )
      .map(({ teamId }) => ({
        id: match.id,
        kickoffAt: match.kickoffAt,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        referee,
        teamId,
        teamName: teamId === match.homeTeamId ? match.homeTeam.name : match.awayTeam.name,
        existing: match.refereeRatings.find((candidate) => candidate.teamId === teamId) ?? null,
      }));
  });
}
