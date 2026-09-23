import type { Prisma, PrismaClient } from "@prisma/client";

import { toAuditActor, writeAudit } from "@/lib/audit";
import { createOfficialGameReport, MatchError } from "@/lib/matches";
import { createNotifications } from "@/lib/notifications";
import { captainResultSchema } from "@/lib/validation";

type Transaction = Prisma.TransactionClient;

export const CAPTAIN_RESULT_STATUSES = [
  "PENDING_OPPONENT",
  "PENDING_ADMIN",
  "REJECTED_OPPONENT",
  "APPROVED",
  "REJECTED_ADMIN",
] as const;

export class CaptainResultError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409 | 422,
    readonly code:
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "NOT_ELIGIBLE"
      | "DUPLICATE"
      | "INVALID_STATE"
      | "VALIDATION_FAILED",
  ) {
    super(message);
    this.name = "CaptainResultError";
  }
}

export interface CaptainResultActor {
  appUserId: string;
  email?: string | null;
  name?: string | null;
}

export interface CaptainResultInput {
  homeScore: number;
  awayScore: number;
  homeForfeit?: boolean;
  awayForfeit?: boolean;
  notes?: string | null;
}

async function activeCaptain(tx: Transaction, userId: string, teamId: string, seasonId: string) {
  return tx.teamCaptain.findFirst({
    where: {
      userId,
      teamId,
      seasonId,
      status: "ACTIVE",
      revokedAt: null,
      user: { status: "ACTIVE" },
    },
    select: { id: true },
  });
}

async function notifyUsers(
  tx: Transaction,
  userIds: string[],
  input: { type: string; title: string; body: string; matchId: string },
) {
  await createNotifications(tx, userIds, {
    type: input.type,
    title: input.title,
    body: input.body,
    href: `/captain/results/${encodeURIComponent(input.matchId)}`,
  });
}

async function captainIds(tx: Transaction, seasonId: string, teamId: string) {
  const rows = await tx.teamCaptain.findMany({
    where: {
      seasonId,
      teamId,
      status: "ACTIVE",
      revokedAt: null,
      userId: { not: null },
      user: { status: "ACTIVE" },
    },
    select: { userId: true },
  });
  return rows.flatMap(({ userId }) => (userId ? [userId] : []));
}

async function adminIds(tx: Transaction) {
  const rows = await tx.globalRoleAssignment.findMany({
    where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  return rows.map(({ userId }) => userId);
}

function validatedInput(input: CaptainResultInput): CaptainResultInput {
  const parsed = captainResultSchema.safeParse(input);
  if (!parsed.success) {
    throw new CaptainResultError(
      parsed.error.issues[0]?.message ?? "Enter a valid result.",
      422,
      "VALIDATION_FAILED",
    );
  }
  return {
    homeScore: parsed.data.homeScore,
    awayScore: parsed.data.awayScore,
    homeForfeit: parsed.data.homeForfeit,
    awayForfeit: parsed.data.awayForfeit,
    notes: parsed.data.notes,
  };
}

export async function submitCaptainResult(
  db: PrismaClient,
  input: {
    matchId: string;
    teamId: string;
    actor: CaptainResultActor;
    result: CaptainResultInput;
    now?: Date;
  },
) {
  const result = validatedInput(input.result);
  try {
    return await db.$transaction(async (tx) => {
      const match = await tx.match.findUnique({
        where: { id: input.matchId },
        select: {
          id: true,
          seasonId: true,
          homeTeamId: true,
          awayTeamId: true,
          kickoffAt: true,
          status: true,
          refereeId: true,
          version: true,
          report: { select: { id: true } },
          resultProposal: { select: { id: true, status: true } },
        },
      });
      if (!match) throw new CaptainResultError("That match does not exist.", 404, "NOT_FOUND");
      if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) {
        throw new CaptainResultError(
          "Only a participating team may propose a result.",
          403,
          "FORBIDDEN",
        );
      }
      if (!(await activeCaptain(tx, input.actor.appUserId, input.teamId, match.seasonId))) {
        throw new CaptainResultError(
          "Active Captain access for this team and season is required.",
          403,
          "FORBIDDEN",
        );
      }
      if (match.kickoffAt > (input.now ?? new Date())) {
        throw new CaptainResultError(
          "A result cannot be proposed before kickoff.",
          409,
          "NOT_ELIGIBLE",
        );
      }
      if (match.refereeId || match.report || match.status !== "SCHEDULED") {
        throw new CaptainResultError(
          "This match is no longer eligible for a Captain result.",
          409,
          "NOT_ELIGIBLE",
        );
      }
      if (
        match.resultProposal &&
        ["PENDING_OPPONENT", "PENDING_ADMIN"].includes(match.resultProposal.status)
      ) {
        throw new CaptainResultError("An open result proposal already exists.", 409, "DUPLICATE");
      }

      const data = {
        submittedById: input.actor.appUserId,
        submittedTeamId: input.teamId,
        homeScore: result.homeScore,
        awayScore: result.awayScore,
        homeForfeit: result.homeForfeit ?? false,
        awayForfeit: result.awayForfeit ?? false,
        notes: result.notes ?? null,
        status: "PENDING_OPPONENT",
        confirmedById: null,
        confirmedAt: null,
        reviewedAt: null,
        reviewNote: null,
      };
      const proposal = match.resultProposal
        ? await tx.captainResultProposal.update({ where: { id: match.resultProposal.id }, data })
        : await tx.captainResultProposal.create({ data: { matchId: match.id, ...data } });

      const opponentId = input.teamId === match.homeTeamId ? match.awayTeamId : match.homeTeamId;
      await notifyUsers(tx, await captainIds(tx, match.seasonId, opponentId), {
        type: "CAPTAIN_RESULT_REVIEW",
        title: "Result needs your confirmation",
        body: "The opposing Captain submitted a result for your match.",
        matchId: match.id,
      });
      await writeAudit(tx, {
        actor: toAuditActor(input.actor, "captain"),
        action: "captain_result.submit",
        entity: "CaptainResultProposal",
        entityId: proposal.id,
        metadata: { matchId: match.id, teamId: input.teamId, matchVersion: match.version, result },
      });
      return proposal;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new CaptainResultError("An open result proposal already exists.", 409, "DUPLICATE");
    }
    throw error;
  }
}

export async function respondToCaptainResult(
  db: PrismaClient,
  input: {
    proposalId: string;
    teamId: string;
    approve: boolean;
    note?: string | null;
    actor: CaptainResultActor;
  },
) {
  return db.$transaction(async (tx) => {
    const proposal = await tx.captainResultProposal.findUnique({
      where: { id: input.proposalId },
      include: { match: true },
    });
    if (!proposal) throw new CaptainResultError("That proposal does not exist.", 404, "NOT_FOUND");
    const match = proposal.match;
    if (input.teamId !== match.homeTeamId && input.teamId !== match.awayTeamId) {
      throw new CaptainResultError("Only a participating team may respond.", 403, "FORBIDDEN");
    }
    if (!(await activeCaptain(tx, input.actor.appUserId, input.teamId, match.seasonId))) {
      throw new CaptainResultError("Active Captain access is required.", 403, "FORBIDDEN");
    }
    if (input.teamId === proposal.submittedTeamId) {
      throw new CaptainResultError(
        "The proposing team cannot confirm its own result.",
        403,
        "FORBIDDEN",
      );
    }
    if (proposal.status !== "PENDING_OPPONENT") {
      throw new CaptainResultError(
        "This proposal is no longer awaiting confirmation.",
        409,
        "INVALID_STATE",
      );
    }
    if (
      match.refereeId ||
      match.status !== "SCHEDULED" ||
      match.updatedAt.getTime() > proposal.createdAt.getTime()
    ) {
      throw new CaptainResultError(
        "The match changed and this proposal can no longer be reviewed.",
        409,
        "NOT_ELIGIBLE",
      );
    }
    const hasReport = await tx.gameReport.count({ where: { matchId: match.id } });
    if (hasReport) {
      throw new CaptainResultError("An official report now exists.", 409, "NOT_ELIGIBLE");
    }

    const status = input.approve ? "PENDING_ADMIN" : "REJECTED_OPPONENT";
    const updated = await tx.captainResultProposal.updateMany({
      where: { id: proposal.id, status: "PENDING_OPPONENT" },
      data: {
        status,
        confirmedById: input.actor.appUserId,
        confirmedAt: new Date(),
        reviewNote: input.note?.trim() || null,
      },
    });
    if (updated.count !== 1) {
      throw new CaptainResultError("This proposal was already reviewed.", 409, "INVALID_STATE");
    }
    const recipients = input.approve
      ? [...(await adminIds(tx)), proposal.submittedById]
      : [proposal.submittedById];
    await notifyUsers(tx, recipients, {
      type: input.approve ? "CAPTAIN_RESULT_ADMIN_REVIEW" : "CAPTAIN_RESULT_REJECTED",
      title: input.approve ? "Result ready for league review" : "Result proposal rejected",
      body: input.approve
        ? "Both teams agreed on the result. League approval is pending."
        : "The opposing Captain rejected the proposed result.",
      matchId: match.id,
    });
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "captain"),
      action: input.approve ? "captain_result.confirm" : "captain_result.reject_opponent",
      entity: "CaptainResultProposal",
      entityId: proposal.id,
      metadata: { matchId: match.id, teamId: input.teamId, note: input.note?.trim() || null },
    });
  });
}

export async function reviewCaptainResult(
  db: PrismaClient,
  input: {
    proposalId: string;
    approve: boolean;
    note?: string | null;
    actor: CaptainResultActor;
  },
) {
  return db.$transaction(async (tx) => {
    const admin = await tx.globalRoleAssignment.findFirst({
      where: {
        userId: input.actor.appUserId,
        role: "ADMIN",
        revokedAt: null,
        user: { status: "ACTIVE" },
      },
      select: { id: true },
    });
    if (!admin) {
      throw new CaptainResultError("Administrator access is required.", 403, "FORBIDDEN");
    }
    const proposal = await tx.captainResultProposal.findUnique({
      where: { id: input.proposalId },
      include: { match: true },
    });
    if (!proposal) throw new CaptainResultError("That proposal does not exist.", 404, "NOT_FOUND");
    if (proposal.status !== "PENDING_ADMIN") {
      throw new CaptainResultError(
        "This proposal is not awaiting league review.",
        409,
        "INVALID_STATE",
      );
    }

    const match = proposal.match;
    if (input.approve) {
      if (
        match.refereeId ||
        match.status !== "SCHEDULED" ||
        match.updatedAt.getTime() > proposal.createdAt.getTime()
      ) {
        throw new CaptainResultError(
          "The fixture changed; the proposal cannot be finalized.",
          409,
          "NOT_ELIGIBLE",
        );
      }
      if (await tx.gameReport.count({ where: { matchId: match.id } })) {
        throw new CaptainResultError("An official report already exists.", 409, "NOT_ELIGIBLE");
      }
      try {
        await createOfficialGameReport(tx, {
          matchId: match.id,
          expectedVersion: match.version,
          requireUnassigned: true,
          actor: { ...toAuditActor(input.actor, "admin"), isAdmin: true },
          reason: "Approved Captain-submitted result",
          homeScore: proposal.homeScore,
          awayScore: proposal.awayScore,
          homeForfeit: proposal.homeForfeit,
          awayForfeit: proposal.awayForfeit,
          notes: proposal.notes,
        });
      } catch (error) {
        if (error instanceof MatchError) {
          throw new CaptainResultError(error.message, 409, "NOT_ELIGIBLE");
        }
        throw error;
      }
    }

    const updated = await tx.captainResultProposal.updateMany({
      where: { id: proposal.id, status: "PENDING_ADMIN" },
      data: {
        status: input.approve ? "APPROVED" : "REJECTED_ADMIN",
        reviewedAt: new Date(),
        reviewNote: input.note?.trim() || null,
      },
    });
    if (updated.count !== 1) {
      throw new CaptainResultError("This proposal was already reviewed.", 409, "INVALID_STATE");
    }
    const recipients = [
      ...(await captainIds(tx, match.seasonId, match.homeTeamId)),
      ...(await captainIds(tx, match.seasonId, match.awayTeamId)),
    ];
    await notifyUsers(tx, recipients, {
      type: input.approve ? "CAPTAIN_RESULT_APPROVED" : "CAPTAIN_RESULT_REJECTED",
      title: input.approve ? "Captain result approved" : "Captain result rejected",
      body: input.approve
        ? "The league approved the result and updated the standings."
        : "The league rejected the proposed result.",
      matchId: match.id,
    });
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "admin"),
      action: input.approve ? "captain_result.approve" : "captain_result.reject_admin",
      entity: "CaptainResultProposal",
      entityId: proposal.id,
      metadata: {
        matchId: match.id,
        matchVersion: match.version,
        note: input.note?.trim() || null,
      },
    });
  });
}

export async function listCaptainResultMatches(db: PrismaClient, appUserId: string) {
  const assignments = await db.teamCaptain.findMany({
    where: { userId: appUserId, status: "ACTIVE", revokedAt: null, seasonId: { not: null } },
    select: { seasonId: true, teamId: true },
  });
  const contexts = assignments.flatMap(({ seasonId, teamId }) =>
    seasonId ? [{ seasonId, teamId }] : [],
  );
  if (!contexts.length) return [];
  const matches = await db.match.findMany({
    where: {
      OR: contexts.map(({ seasonId, teamId }) => ({
        seasonId,
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      })),
      kickoffAt: { lte: new Date() },
    },
    include: { homeTeam: true, awayTeam: true, report: true, resultProposal: true },
    orderBy: { kickoffAt: "desc" },
  });
  return matches.map((match) => ({
    ...match,
    captainTeamId:
      contexts.find(
        ({ seasonId, teamId }) =>
          seasonId === match.seasonId &&
          (teamId === match.homeTeamId || teamId === match.awayTeamId),
      )?.teamId ?? "",
  }));
}
