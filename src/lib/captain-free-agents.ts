import type { PrismaClient } from "@prisma/client";

import { writeAudit } from "@/lib/audit";
import { listAvailableFreeAgents } from "@/lib/free-agents";
import { createRosterInvitation, RosterError } from "@/lib/roster";

export class CaptainFreeAgentError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code: "INVALID_FILTER" | "FORBIDDEN" | "NOT_FOUND" | "INVALID_STATE",
  ) {
    super(message);
    this.name = "CaptainFreeAgentError";
  }
}

export interface CaptainFreeAgentFilters {
  divisionId?: string;
}

async function activeAssignments(db: PrismaClient, actorId: string) {
  return db.teamCaptain.findMany({
    where: {
      userId: actorId,
      status: "ACTIVE",
      revokedAt: null,
      seasonId: { not: null },
      user: { status: "ACTIVE" },
    },
    include: {
      team: { select: { id: true, name: true } },
      season: { select: { id: true, name: true, isActive: true, startsOn: true } },
    },
    orderBy: [{ season: { startsOn: "desc" } }, { team: { name: "asc" } }],
  });
}

export async function listCaptainFreeAgents(
  db: PrismaClient,
  input: { actorId: string; filters?: CaptainFreeAgentFilters },
) {
  const actor = await db.appUser.findUnique({ where: { id: input.actorId } });
  if (!actor || actor.status !== "ACTIVE") {
    throw new CaptainFreeAgentError("An active Captain account is required.", 403, "FORBIDDEN");
  }
  const assignments = await activeAssignments(db, actor.id);
  if (!assignments.length) {
    throw new CaptainFreeAgentError(
      "An active Captain assignment is required to view free-agent contact details.",
      403,
      "FORBIDDEN",
    );
  }

  const assignmentKeys = new Set(
    assignments.map(({ seasonId, teamId }) => `${seasonId}:${teamId}`),
  );
  const requests = (
    await listAvailableFreeAgents(db, {
      divisionId: input.filters?.divisionId,
    })
  ).map((request) => ({
    ...request,
    invitations: request.invitations.filter((invitation) =>
      assignmentKeys.has(`${invitation.seasonId}:${invitation.teamId}`),
    ),
  }));

  await writeAudit(db, {
    actor: { id: actor.id, email: actor.email, name: actor.displayName, role: "captain" },
    action: "free_agent.contact_data.view",
    entity: "FreeAgentRequest",
    entityId: "captain-list",
    metadata: {
      divisionId: input.filters?.divisionId ?? null,
      resultCount: requests.length,
    },
  });
  return { assignments, requests };
}

export async function placeFreeAgent(
  db: PrismaClient,
  input: {
    actorId: string;
    requestId: string;
    seasonId: string;
    teamId: string;
  },
) {
  if (!input.requestId || !input.seasonId || !input.teamId) {
    throw new CaptainFreeAgentError(
      "The free agent, season, and team are required.",
      400,
      "INVALID_STATE",
    );
  }
  try {
    return await createRosterInvitation(db, {
      invitedById: input.actorId,
      seasonId: input.seasonId,
      teamId: input.teamId,
      freeAgentRequestId: input.requestId,
    });
  } catch (error) {
    if (error instanceof RosterError) throw error;
    throw error;
  }
}
