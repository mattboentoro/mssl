import { Prisma, type PrismaClient } from "@prisma/client";

import { toAuditActor, writeAudit } from "@/lib/audit";
import { ensureProvisionalIdentity, normalizeEmail } from "@/lib/rbac";

export class AdminRosterError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_INPUT"
      | "NOT_FOUND"
      | "INVALID_TEAM_SEASON"
      | "IDENTITY_CONFLICT"
      | "RELINK_CONFLICT" = "INVALID_INPUT",
  ) {
    super(message);
    this.name = "AdminRosterError";
  }
}

export function isActiveCaptainForSeason(
  captain: {
    seasonId: string | null;
    status: string;
    user?: { status: string } | null;
  },
  seasonId: string,
): boolean {
  return (
    captain.seasonId === seasonId &&
    captain.status === "ACTIVE" &&
    captain.user?.status === "ACTIVE"
  );
}

export async function relinkCaptainIdentity(
  db: PrismaClient,
  input: {
    captainId: string;
    seasonId: string;
    expectedUpdatedAt: string;
    email: string;
    name: string;
    actor: { appUserId: string; email?: string | null; name?: string | null };
  },
) {
  const email = input.email.trim();
  const name = input.name.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AdminRosterError("Enter a valid Captain e-mail address.");
  }
  if (!name) throw new AdminRosterError("Captain name is required.");
  const expectedUpdatedAt = new Date(input.expectedUpdatedAt);
  if (!input.seasonId || Number.isNaN(expectedUpdatedAt.getTime())) {
    throw new AdminRosterError("Refresh the page and choose a valid team-season.");
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const captain = await tx.teamCaptain.findUnique({
          where: { id: input.captainId },
          include: { user: true, team: { select: { name: true } } },
        });
        if (!captain) {
          throw new AdminRosterError("That Captain record no longer exists.", "NOT_FOUND");
        }
        if (captain.revokedAt || captain.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          throw new AdminRosterError(
            "This Captain record was changed or removed. Refresh before trying again.",
            "RELINK_CONFLICT",
          );
        }
        if (captain.seasonId && captain.seasonId !== input.seasonId) {
          throw new AdminRosterError(
            "This Captain record belongs to a different season.",
            "INVALID_TEAM_SEASON",
          );
        }
        const teamSeason = await tx.seasonTeam.findUnique({
          where: {
            seasonId_teamId: { seasonId: input.seasonId, teamId: captain.teamId },
          },
        });
        if (!teamSeason) {
          throw new AdminRosterError(
            "That team is not registered in the selected season.",
            "INVALID_TEAM_SEASON",
          );
        }

        const normalizedEmail = normalizeEmail(email);
        const target = await ensureProvisionalIdentity(tx, { email, displayName: name });
        if (
          captain.userId &&
          captain.userId !== target.id &&
          (captain.user?.entraObjectId || captain.user?.status !== "PROVISIONAL")
        ) {
          throw new AdminRosterError(
            "This Captain record is already linked to a claimed identity.",
            "IDENTITY_CONFLICT",
          );
        }
        const conflictingAssignment = await tx.teamCaptain.findFirst({
          where: {
            id: { not: captain.id },
            seasonId: input.seasonId,
            revokedAt: null,
            OR: [{ userId: target.id }, { normalizedEmail }],
          },
        });
        if (conflictingAssignment) {
          throw new AdminRosterError(
            "That identity already has a Captain assignment in this season.",
            "IDENTITY_CONFLICT",
          );
        }
        const occupiedOrder = await tx.teamCaptain.findFirst({
          where: {
            id: { not: captain.id },
            seasonId: input.seasonId,
            teamId: captain.teamId,
            sortOrder: captain.sortOrder,
          },
          select: { id: true },
        });
        const maxOrder = occupiedOrder
          ? await tx.teamCaptain.aggregate({
              where: { seasonId: input.seasonId, teamId: captain.teamId },
              _max: { sortOrder: true },
            })
          : null;
        const result = await tx.teamCaptain.updateMany({
          where: {
            id: captain.id,
            updatedAt: expectedUpdatedAt,
            revokedAt: null,
            seasonId: captain.seasonId,
          },
          data: {
            seasonId: input.seasonId,
            name,
            email,
            normalizedEmail,
            userId: target.id,
            status: target.status === "ACTIVE" ? "ACTIVE" : "PENDING",
            activatedAt: target.status === "ACTIVE" ? new Date() : null,
            sortOrder: maxOrder ? (maxOrder._max.sortOrder ?? -1) + 1 : captain.sortOrder,
          },
        });
        if (result.count !== 1) {
          throw new AdminRosterError(
            "This Captain record was changed or removed. Refresh before trying again.",
            "RELINK_CONFLICT",
          );
        }
        const updated = await tx.teamCaptain.findUniqueOrThrow({ where: { id: captain.id } });
        await writeAudit(tx, {
          actor: toAuditActor(input.actor, "admin"),
          action: "captain.identity_relink",
          entity: "TeamCaptain",
          entityId: captain.id,
          metadata: {
            teamId: captain.teamId,
            seasonId: input.seasonId,
            before: {
              seasonId: captain.seasonId,
              name: captain.name,
              email: captain.email,
              userId: captain.userId,
              status: captain.status,
            },
            after: {
              seasonId: input.seasonId,
              name,
              email,
              userId: target.id,
              status: updated.status,
            },
          },
        });
        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );
  } catch (error) {
    if (error instanceof AdminRosterError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P1008" || error.code === "P2002" || error.code === "P2034")
    ) {
      throw new AdminRosterError(
        "This Captain record was changed or conflicts with another assignment. Refresh and try again.",
        "RELINK_CONFLICT",
      );
    }
    throw error;
  }
}
