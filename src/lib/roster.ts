import { Prisma, type AppUser, type PrismaClient } from "@prisma/client";

import { writeAudit } from "@/lib/audit";
import { normalizeEmail } from "@/lib/rbac";

type Transaction = Prisma.TransactionClient;

export class RosterError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code:
      | "INVALID_REQUEST"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "DUPLICATE_OPEN"
      | "ALREADY_ROSTERED"
      | "INVALID_STATE",
  ) {
    super(message);
    this.name = "RosterError";
  }
}

interface Actor {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
}

interface TeamSeasonInput {
  seasonId: string;
  teamId: string;
}

interface MessageInput {
  message?: string | null;
}

const cleanMessage = (message?: string | null) => {
  const value = message?.trim();
  return value ? value.slice(0, 500) : null;
};

async function actorFor(tx: Transaction, actorId: string): Promise<Actor> {
  const user = await tx.appUser.findUnique({
    where: { id: actorId },
    include: {
      rolesAssigned: { where: { role: "ADMIN", revokedAt: null }, select: { id: true } },
    },
  });
  if (!user || user.status !== "ACTIVE") {
    throw new RosterError("Your application account is not active.", 403, "FORBIDDEN");
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.rolesAssigned.length > 0,
  };
}

async function assertTeamSeason(tx: Transaction, input: TeamSeasonInput) {
  const [season, team] = await Promise.all([
    tx.season.findUnique({ where: { id: input.seasonId }, select: { id: true, name: true } }),
    tx.team.findUnique({ where: { id: input.teamId }, select: { id: true, name: true } }),
  ]);
  if (!season || !team) {
    throw new RosterError("That team or season no longer exists.", 404, "NOT_FOUND");
  }
  return { season, team };
}

async function assertManager(tx: Transaction, actor: Actor, input: TeamSeasonInput): Promise<void> {
  if (actor.isAdmin) return;
  const captain = await tx.teamCaptain.findFirst({
    where: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      userId: actor.id,
      status: "ACTIVE",
      revokedAt: null,
    },
    select: { id: true },
  });
  if (!captain) {
    throw new RosterError("Captain access for this team and season is required.", 403, "FORBIDDEN");
  }
}

async function notify(
  tx: Transaction,
  userIds: Array<string | null | undefined>,
  data: { type: string; title: string; body: string; href?: string },
) {
  const uniqueIds = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (!uniqueIds.length) return;
  await tx.notification.createMany({
    data: uniqueIds.map((userId) => ({ userId, ...data })),
  });
}

async function captainIds(tx: Transaction, input: TeamSeasonInput): Promise<string[]> {
  const captains = await tx.teamCaptain.findMany({
    where: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      status: "ACTIVE",
      revokedAt: null,
      userId: { not: null },
    },
    select: { userId: true },
  });
  return captains.flatMap(({ userId }) => (userId ? [userId] : []));
}

async function adminIds(tx: Transaction): Promise<string[]> {
  const assignments = await tx.globalRoleAssignment.findMany({
    where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
    select: { userId: true },
  });
  return assignments.map(({ userId }) => userId);
}

async function notifyIfCaptainless(
  tx: Transaction,
  input: TeamSeasonInput & { teamName: string; seasonName: string },
) {
  const remaining = await tx.teamCaptain.count({
    where: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      status: "ACTIVE",
      revokedAt: null,
    },
  });
  if (remaining > 0) return false;
  await notify(tx, await adminIds(tx), {
    type: "ROSTER_CAPTAINLESS",
    title: `${input.teamName} is Captainless`,
    body: `${input.teamName} has no active captain for ${input.seasonName}.`,
    href: `/captain/roster?seasonId=${input.seasonId}&teamId=${input.teamId}`,
  });
  return true;
}

function auditActor(actor: Actor, role: "admin" | "captain" | "player") {
  return {
    id: actor.id,
    email: actor.email,
    name: actor.displayName,
    role: actor.isAdmin ? "admin" : role,
  };
}

async function activeMembership(tx: Transaction, seasonId: string, userId: string) {
  return tx.teamMembership.findUnique({
    where: { seasonId_userId: { seasonId, userId } },
  });
}

async function activateMembership(
  tx: Transaction,
  input: TeamSeasonInput & { userId: string; actorId: string },
) {
  const otherCaptainAssignment = await tx.teamCaptain.findFirst({
    where: {
      seasonId: input.seasonId,
      userId: input.userId,
      teamId: { not: input.teamId },
      status: "ACTIVE",
      revokedAt: null,
    },
    select: { id: true },
  });
  if (otherCaptainAssignment) {
    throw new RosterError(
      "This player is already a captain of another team in this season.",
      409,
      "ALREADY_ROSTERED",
    );
  }
  const existing = await activeMembership(tx, input.seasonId, input.userId);
  if (existing?.status === "ACTIVE" && !existing.endedAt) {
    if (existing.teamId === input.teamId) {
      throw new RosterError("This player is already on this roster.", 409, "ALREADY_ROSTERED");
    }
    throw new RosterError(
      "This player already belongs to another team in this season.",
      409,
      "ALREADY_ROSTERED",
    );
  }

  if (existing) {
    const claimed = await tx.teamMembership.updateMany({
      where: {
        id: existing.id,
        OR: [{ status: { not: "ACTIVE" } }, { endedAt: { not: null } }],
      },
      data: {
        teamId: input.teamId,
        status: "ACTIVE",
        assignedById: input.actorId,
        joinedAt: new Date(),
        endedAt: null,
      },
    });
    if (claimed.count !== 1) {
      throw new RosterError(
        "Another roster change already activated this player for the season.",
        409,
        "ALREADY_ROSTERED",
      );
    }
    return tx.teamMembership.findUniqueOrThrow({ where: { id: existing.id } });
  }
  return tx.teamMembership.create({
    data: {
      seasonId: input.seasonId,
      teamId: input.teamId,
      userId: input.userId,
      assignedById: input.actorId,
    },
  });
}

async function cancelOtherOpenRequests(
  tx: Transaction,
  input: { seasonId: string; userId: string; acceptedInvitationId?: string },
) {
  const user = await tx.appUser.findUniqueOrThrow({ where: { id: input.userId } });
  await Promise.all([
    tx.rosterInvitation.updateMany({
      where: {
        id: input.acceptedInvitationId ? { not: input.acceptedInvitationId } : undefined,
        seasonId: input.seasonId,
        normalizedEmail: user.normalizedEmail,
        status: "PENDING",
      },
      data: { status: "CANCELLED", respondedAt: new Date() },
    }),
    tx.rosterJoinRequest.updateMany({
      where: { seasonId: input.seasonId, requesterId: input.userId, status: "PENDING" },
      data: { status: "CANCELLED", decidedAt: new Date() },
    }),
  ]);
}

async function inTransaction<T>(
  db: PrismaClient,
  operation: (tx: Transaction) => Promise<T>,
): Promise<T> {
  try {
    return await db.$transaction(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  } catch (error) {
    if (error instanceof RosterError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P1008" || error.code === "P2002" || error.code === "P2034")
    ) {
      throw new RosterError(
        "Another roster change won the race. Refresh and try again.",
        409,
        "ALREADY_ROSTERED",
      );
    }
    throw error;
  }
}

export async function createJoinRequest(
  db: PrismaClient,
  input: TeamSeasonInput & MessageInput & { requesterId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.requesterId);
    const { team, season } = await assertTeamSeason(tx, input);
    const membership = await activeMembership(tx, input.seasonId, actor.id);
    if (membership?.status === "ACTIVE" && !membership.endedAt) {
      throw new RosterError(
        "You already belong to a team in this season.",
        409,
        "ALREADY_ROSTERED",
      );
    }
    const existing = await tx.rosterJoinRequest.findUnique({
      where: {
        seasonId_teamId_requesterId: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          requesterId: actor.id,
        },
      },
    });
    if (existing?.status === "PENDING") {
      throw new RosterError(
        "You already have an open request for this team.",
        409,
        "DUPLICATE_OPEN",
      );
    }

    const request = existing
      ? await tx.rosterJoinRequest.update({
          where: { id: existing.id },
          data: {
            status: "PENDING",
            message: cleanMessage(input.message),
            decidedById: null,
            decidedAt: null,
          },
        })
      : await tx.rosterJoinRequest.create({
          data: {
            seasonId: input.seasonId,
            teamId: input.teamId,
            requesterId: actor.id,
            message: cleanMessage(input.message),
          },
        });

    await notify(tx, await captainIds(tx, input), {
      type: "ROSTER_JOIN_REQUEST",
      title: `Join request from ${actor.displayName}`,
      body: `${actor.displayName} asked to join ${team.name} for ${season.name}.`,
      href: "/captain/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "player"),
      action: "roster.join_request.create",
      entity: "RosterJoinRequest",
      entityId: request.id,
      metadata: { seasonId: input.seasonId, teamId: input.teamId },
    });
    return request;
  });
}

export async function cancelJoinRequest(
  db: PrismaClient,
  input: { requestId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const request = await tx.rosterJoinRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new RosterError("That join request does not exist.", 404, "NOT_FOUND");
    if (request.requesterId !== actor.id && !actor.isAdmin) {
      throw new RosterError("Only the sender can cancel this request.", 403, "FORBIDDEN");
    }
    if (request.status !== "PENDING") {
      throw new RosterError("That join request is no longer open.", 409, "INVALID_STATE");
    }
    const updated = await tx.rosterJoinRequest.update({
      where: { id: request.id },
      data: { status: "CANCELLED", decidedById: actor.id, decidedAt: new Date() },
    });
    await notify(tx, await captainIds(tx, request), {
      type: "ROSTER_JOIN_CANCELLED",
      title: "Join request cancelled",
      body: `${actor.displayName} cancelled their roster request.`,
      href: "/captain/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "player"),
      action: "roster.join_request.cancel",
      entity: "RosterJoinRequest",
      entityId: request.id,
    });
    return updated;
  });
}

export async function decideJoinRequest(
  db: PrismaClient,
  input: { requestId: string; actorId: string; decision: "ACCEPTED" | "REJECTED" },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const request = await tx.rosterJoinRequest.findUnique({
      where: { id: input.requestId },
      include: { requester: true, team: true, season: true },
    });
    if (!request) throw new RosterError("That join request does not exist.", 404, "NOT_FOUND");
    await assertManager(tx, actor, request);
    if (request.status !== "PENDING") {
      throw new RosterError("That join request has already been decided.", 409, "INVALID_STATE");
    }

    if (input.decision === "ACCEPTED") {
      await activateMembership(tx, {
        seasonId: request.seasonId,
        teamId: request.teamId,
        userId: request.requesterId,
        actorId: actor.id,
      });
      await cancelOtherOpenRequests(tx, {
        seasonId: request.seasonId,
        userId: request.requesterId,
      });
    }
    const updated = await tx.rosterJoinRequest.update({
      where: { id: request.id },
      data: { status: input.decision, decidedById: actor.id, decidedAt: new Date() },
    });
    await notify(tx, [request.requesterId], {
      type: `ROSTER_JOIN_${input.decision}`,
      title: `Join request ${input.decision.toLowerCase()}`,
      body: `${request.team.name} ${input.decision === "ACCEPTED" ? "accepted" : "declined"} your request for ${request.season.name}.`,
      href: "/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: `roster.join_request.${input.decision.toLowerCase()}`,
      entity: "RosterJoinRequest",
      entityId: request.id,
      metadata: { requesterId: request.requesterId, teamId: request.teamId },
    });
    return updated;
  });
}

export async function createRosterInvitation(
  db: PrismaClient,
  input: TeamSeasonInput &
    MessageInput & { invitedById: string; invitedUserId?: string | null; email?: string | null },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.invitedById);
    await assertManager(tx, actor, input);
    const { team, season } = await assertTeamSeason(tx, input);

    let invitedUser: AppUser | null = null;
    if (input.invitedUserId) {
      invitedUser = await tx.appUser.findUnique({ where: { id: input.invitedUserId } });
      if (!invitedUser) {
        throw new RosterError("That application user does not exist.", 404, "NOT_FOUND");
      }
    }
    const email = invitedUser?.email ?? input.email?.trim() ?? "";
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new RosterError("Enter a valid player e-mail address.", 400, "INVALID_REQUEST");
    }
    if (normalizedEmail === actor.email.trim().toLowerCase()) {
      throw new RosterError("You cannot invite yourself.", 400, "INVALID_REQUEST");
    }

    if (!invitedUser) {
      invitedUser = await tx.appUser.upsert({
        where: { normalizedEmail },
        create: {
          email: email.trim(),
          normalizedEmail,
          displayName: email.trim(),
          status: "PROVISIONAL",
        },
        update: {},
      });
    }
    const membership = await activeMembership(tx, input.seasonId, invitedUser.id);
    if (membership?.status === "ACTIVE" && !membership.endedAt) {
      throw new RosterError(
        membership.teamId === input.teamId
          ? "This player is already on this roster."
          : "This player already belongs to another team in this season.",
        409,
        "ALREADY_ROSTERED",
      );
    }
    const duplicate = await tx.rosterInvitation.findFirst({
      where: {
        seasonId: input.seasonId,
        teamId: input.teamId,
        normalizedEmail,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new RosterError(
        "An open invitation already exists for this player.",
        409,
        "DUPLICATE_OPEN",
      );
    }
    const invitation = await tx.rosterInvitation.create({
      data: {
        seasonId: input.seasonId,
        teamId: input.teamId,
        invitedById: actor.id,
        invitedUserId: invitedUser.id,
        email: email.trim(),
        normalizedEmail,
        message: cleanMessage(input.message),
      },
    });
    if (invitedUser.status === "ACTIVE") {
      await notify(tx, [invitedUser.id], {
        type: "ROSTER_INVITATION",
        title: `Invitation from ${team.name}`,
        body: `${actor.displayName} invited you to join ${team.name} for ${season.name}.`,
        href: "/roster",
      });
    }
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: "roster.invitation.create",
      entity: "RosterInvitation",
      entityId: invitation.id,
      metadata: { teamId: input.teamId, seasonId: input.seasonId, normalizedEmail },
    });
    return invitation;
  });
}

export async function cancelRosterInvitation(
  db: PrismaClient,
  input: { invitationId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const invitation = await tx.rosterInvitation.findUnique({
      where: { id: input.invitationId },
    });
    if (!invitation) throw new RosterError("That invitation does not exist.", 404, "NOT_FOUND");
    if (invitation.invitedById !== actor.id && !actor.isAdmin) {
      throw new RosterError("Only the sender can cancel this invitation.", 403, "FORBIDDEN");
    }
    if (invitation.status !== "PENDING") {
      throw new RosterError("That invitation is no longer open.", 409, "INVALID_STATE");
    }
    const updated = await tx.rosterInvitation.update({
      where: { id: invitation.id },
      data: { status: "CANCELLED", respondedAt: new Date() },
    });
    await notify(tx, [invitation.invitedUserId], {
      type: "ROSTER_INVITATION_CANCELLED",
      title: "Roster invitation cancelled",
      body: `${actor.displayName} cancelled the roster invitation.`,
      href: "/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: "roster.invitation.cancel",
      entity: "RosterInvitation",
      entityId: invitation.id,
    });
    return updated;
  });
}

export async function respondToRosterInvitation(
  db: PrismaClient,
  input: { invitationId: string; actorId: string; decision: "ACCEPTED" | "REJECTED" },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const invitation = await tx.rosterInvitation.findUnique({
      where: { id: input.invitationId },
      include: { team: true, season: true },
    });
    if (!invitation) throw new RosterError("That invitation does not exist.", 404, "NOT_FOUND");
    if (
      invitation.invitedUserId !== actor.id &&
      invitation.normalizedEmail !== actor.email.trim().toLowerCase()
    ) {
      throw new RosterError("This invitation belongs to another player.", 403, "FORBIDDEN");
    }
    if (invitation.status !== "PENDING") {
      throw new RosterError("That invitation has already been answered.", 409, "INVALID_STATE");
    }

    if (input.decision === "ACCEPTED") {
      await activateMembership(tx, {
        seasonId: invitation.seasonId,
        teamId: invitation.teamId,
        userId: actor.id,
        actorId: actor.id,
      });
      await cancelOtherOpenRequests(tx, {
        seasonId: invitation.seasonId,
        userId: actor.id,
        acceptedInvitationId: invitation.id,
      });
    }
    const updated = await tx.rosterInvitation.update({
      where: { id: invitation.id },
      data: {
        invitedUserId: actor.id,
        status: input.decision,
        respondedAt: new Date(),
      },
    });
    await notify(tx, [invitation.invitedById], {
      type: `ROSTER_INVITATION_${input.decision}`,
      title: `Invitation ${input.decision.toLowerCase()}`,
      body: `${actor.displayName} ${input.decision === "ACCEPTED" ? "accepted" : "declined"} the invitation to ${invitation.team.name}.`,
      href: "/captain/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "player"),
      action: `roster.invitation.${input.decision.toLowerCase()}`,
      entity: "RosterInvitation",
      entityId: invitation.id,
      metadata: { teamId: invitation.teamId, seasonId: invitation.seasonId },
    });
    return updated;
  });
}

export async function leaveRoster(
  db: PrismaClient,
  input: { membershipId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const membership = await tx.teamMembership.findUnique({
      where: { id: input.membershipId },
      include: { team: true, season: true },
    });
    if (!membership) throw new RosterError("That membership does not exist.", 404, "NOT_FOUND");
    if (membership.userId !== actor.id) {
      throw new RosterError("You can only leave your own roster.", 403, "FORBIDDEN");
    }
    if (membership.status !== "ACTIVE" || membership.endedAt) {
      throw new RosterError("That membership is no longer active.", 409, "INVALID_STATE");
    }
    const now = new Date();
    const [updated, revoked] = await Promise.all([
      tx.teamMembership.update({
        where: { id: membership.id },
        data: { status: "ENDED", endedAt: now },
      }),
      tx.teamCaptain.updateMany({
        where: {
          seasonId: membership.seasonId,
          teamId: membership.teamId,
          userId: actor.id,
          status: "ACTIVE",
          revokedAt: null,
        },
        data: { status: "REVOKED", revokedAt: now },
      }),
    ]);
    const teamBecameCaptainless =
      revoked.count > 0 &&
      (await notifyIfCaptainless(tx, {
        seasonId: membership.seasonId,
        teamId: membership.teamId,
        teamName: membership.team.name,
        seasonName: membership.season.name,
      }));
    await notify(tx, await captainIds(tx, membership), {
      type: "ROSTER_PLAYER_LEFT",
      title: `${actor.displayName} left the roster`,
      body: `${actor.displayName} left ${membership.team.name} for ${membership.season.name}.`,
      href: "/captain/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "player"),
      action: "roster.membership.leave",
      entity: "TeamMembership",
      entityId: membership.id,
      metadata: {
        teamId: membership.teamId,
        captainAssignmentEnded: revoked.count > 0,
        teamBecameCaptainless,
      },
    });
    return updated;
  });
}

export async function removeRosterMember(
  db: PrismaClient,
  input: { membershipId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const membership = await tx.teamMembership.findUnique({
      where: { id: input.membershipId },
      include: { user: true, team: true, season: true },
    });
    if (!membership) throw new RosterError("That membership does not exist.", 404, "NOT_FOUND");
    await assertManager(tx, actor, membership);
    if (membership.status !== "ACTIVE" || membership.endedAt) {
      throw new RosterError("That membership is no longer active.", 409, "INVALID_STATE");
    }
    const now = new Date();
    const [updated, revoked] = await Promise.all([
      tx.teamMembership.update({
        where: { id: membership.id },
        data: { status: "REMOVED", endedAt: now },
      }),
      tx.teamCaptain.updateMany({
        where: {
          seasonId: membership.seasonId,
          teamId: membership.teamId,
          userId: membership.userId,
          status: "ACTIVE",
          revokedAt: null,
        },
        data: { status: "REVOKED", revokedAt: now },
      }),
    ]);
    const teamBecameCaptainless =
      revoked.count > 0 &&
      (await notifyIfCaptainless(tx, {
        seasonId: membership.seasonId,
        teamId: membership.teamId,
        teamName: membership.team.name,
        seasonName: membership.season.name,
      }));
    await notify(tx, [membership.userId], {
      type: "ROSTER_REMOVED",
      title: `Removed from ${membership.team.name}`,
      body: `Your roster membership for ${membership.season.name} was ended.`,
      href: "/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: "roster.membership.remove",
      entity: "TeamMembership",
      entityId: membership.id,
      metadata: {
        userId: membership.userId,
        teamId: membership.teamId,
        teamBecameCaptainless,
      },
    });
    return updated;
  });
}

export async function promoteRosterMember(
  db: PrismaClient,
  input: { membershipId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const membership = await tx.teamMembership.findUnique({
      where: { id: input.membershipId },
      include: { user: true, team: true, season: true },
    });
    if (!membership) throw new RosterError("That membership does not exist.", 404, "NOT_FOUND");
    await assertManager(tx, actor, membership);
    if (membership.status !== "ACTIVE" || membership.endedAt) {
      throw new RosterError("Only an active roster member can be promoted.", 409, "INVALID_STATE");
    }
    const existing = await tx.teamCaptain.findFirst({
      where: {
        seasonId: membership.seasonId,
        teamId: membership.teamId,
        userId: membership.userId,
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing?.status === "ACTIVE" && !existing.revokedAt) {
      throw new RosterError("This player is already a captain.", 409, "INVALID_STATE");
    }
    const maxOrder = await tx.teamCaptain.aggregate({
      where: { seasonId: membership.seasonId, teamId: membership.teamId },
      _max: { sortOrder: true },
    });
    const data = {
      userId: membership.userId,
      name: membership.user.displayName,
      email: membership.user.email,
      normalizedEmail: membership.user.normalizedEmail,
      status: "ACTIVE",
      assignedById: actor.id,
      assignedAt: new Date(),
      activatedAt: new Date(),
      revokedAt: null,
    };
    const captain = existing
      ? await tx.teamCaptain.update({ where: { id: existing.id }, data })
      : await tx.teamCaptain.create({
          data: {
            ...data,
            seasonId: membership.seasonId,
            teamId: membership.teamId,
            sortOrder: (maxOrder._max.sortOrder ?? -1) + 1,
          },
        });
    await notify(tx, [membership.userId], {
      type: "ROSTER_PROMOTED",
      title: `You are now a captain of ${membership.team.name}`,
      body: `Captain access is active for ${membership.season.name}.`,
      href: "/captain",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: "roster.member.promote",
      entity: "TeamCaptain",
      entityId: captain.id,
      metadata: { userId: membership.userId, membershipId: membership.id },
    });
    return captain;
  });
}

export async function demoteRosterCaptain(
  db: PrismaClient,
  input: { captainId: string; actorId: string },
) {
  return inTransaction(db, async (tx) => {
    const actor = await actorFor(tx, input.actorId);
    const captain = await tx.teamCaptain.findUnique({
      where: { id: input.captainId },
      include: { user: true, team: true, season: true },
    });
    if (!captain || !captain.seasonId) {
      throw new RosterError("That captain assignment does not exist.", 404, "NOT_FOUND");
    }
    await assertManager(tx, actor, { seasonId: captain.seasonId, teamId: captain.teamId });
    if (captain.status !== "ACTIVE" || captain.revokedAt) {
      throw new RosterError("That captain assignment is no longer active.", 409, "INVALID_STATE");
    }
    const updated = await tx.teamCaptain.update({
      where: { id: captain.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    const teamBecameCaptainless = await notifyIfCaptainless(tx, {
      seasonId: captain.seasonId,
      teamId: captain.teamId,
      teamName: captain.team.name,
      seasonName: captain.season?.name ?? "this season",
    });
    await notify(tx, [captain.userId], {
      type: "ROSTER_DEMOTED",
      title: `Captain access ended for ${captain.team.name}`,
      body: captain.season
        ? `You remain a player on the roster for ${captain.season.name}.`
        : "You remain a player on the roster.",
      href: "/roster",
    });
    await writeAudit(tx, {
      actor: auditActor(actor, "captain"),
      action: "roster.captain.demote",
      entity: "TeamCaptain",
      entityId: captain.id,
      metadata: {
        userId: captain.userId,
        teamId: captain.teamId,
        teamBecameCaptainless,
      },
    });
    return updated;
  });
}
