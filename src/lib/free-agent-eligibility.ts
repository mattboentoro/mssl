import type { PrismaClient } from "@prisma/client";

export class FreeAgentEligibilityError extends Error {
  constructor(
    message = "You cannot sign up as a free agent while you are associated with a team.",
  ) {
    super(message);
    this.name = "FreeAgentEligibilityError";
  }
}

export async function getActiveTeamAssociation(db: PrismaClient, appUserId: string) {
  const [membership, captainAssignment] = await Promise.all([
    db.teamMembership.findFirst({
      where: {
        userId: appUserId,
        status: "ACTIVE",
        endedAt: null,
      },
      select: { team: { select: { id: true, name: true } } },
      orderBy: { joinedAt: "desc" },
    }),
    db.teamCaptain.findFirst({
      where: {
        userId: appUserId,
        status: "ACTIVE",
        revokedAt: null,
      },
      select: { team: { select: { id: true, name: true } } },
      orderBy: { assignedAt: "desc" },
    }),
  ]);

  const association = membership ?? captainAssignment;
  return association?.team ?? null;
}

export async function requireFreeAgentEligibility(db: PrismaClient, appUserId: string) {
  const team = await getActiveTeamAssociation(db, appUserId);
  if (team) {
    throw new FreeAgentEligibilityError(
      `You are currently associated with ${team.name}. Leave the team before signing up as a free agent.`,
    );
  }
}
