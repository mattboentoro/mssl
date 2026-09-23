import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { claimApplicationIdentity } from "@/lib/rbac";
import {
  cancelJoinRequest,
  cancelRosterInvitation,
  createJoinRequest,
  createRosterInvitation,
  decideJoinRequest,
  demoteRosterCaptain,
  leaveRoster,
  promoteRosterMember,
  removeRosterMember,
  respondToRosterInvitation,
  RosterError,
} from "@/lib/roster";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.refereeRating.deleteMany();
  await prisma.scoreAppeal.deleteMany();
  await prisma.captainResultProposal.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.rosterJoinRequest.deleteMany();
  await prisma.rosterInvitation.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.teamCaptain.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.disciplinaryAction.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.seasonTeam.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.appUser.deleteMany();
}

async function user(
  key: string,
  options: { admin?: boolean; player?: boolean; status?: string } = {},
) {
  return prisma.appUser.create({
    data: {
      entraObjectId: `entra-${key}`,
      email: `${key}@example.com`,
      normalizedEmail: `${key}@example.com`,
      displayName: key.replaceAll("-", " "),
      status: options.status ?? "ACTIVE",
      rolesAssigned:
        options.admin || options.player
          ? {
              create: [
                ...(options.admin ? [{ role: "ADMIN" }] : []),
                ...(options.player ? [{ role: "PLAYER" }] : []),
              ],
            }
          : undefined,
    },
  });
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Roster Season",
      slug: "roster-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
      isActive: true,
    },
  });
  const division = await prisma.division.create({
    data: { name: "Roster Division", slug: "roster-division" },
  });
  const home = await prisma.team.create({
    data: { divisionId: division.id, name: "Home", slug: "roster-home", shortName: "HOME" },
  });
  const away = await prisma.team.create({
    data: { divisionId: division.id, name: "Away", slug: "roster-away", shortName: "AWAY" },
  });
  await prisma.seasonTeam.createMany({
    data: [
      { seasonId: season.id, teamId: home.id, divisionId: division.id },
      { seasonId: season.id, teamId: away.id, divisionId: division.id },
    ],
  });
  const captain = await user("captain", { player: true });
  const awayCaptain = await user("away-captain", { player: true });
  await prisma.teamCaptain.createMany({
    data: [
      {
        seasonId: season.id,
        teamId: home.id,
        userId: captain.id,
        name: captain.displayName,
        email: captain.email,
        normalizedEmail: captain.normalizedEmail,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
      {
        seasonId: season.id,
        teamId: away.id,
        userId: awayCaptain.id,
        name: awayCaptain.displayName,
        email: awayCaptain.email,
        normalizedEmail: awayCaptain.normalizedEmail,
        status: "ACTIVE",
        activatedAt: new Date(),
      },
    ],
  });
  return { season, home, away, captain, awayCaptain };
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("bidirectional roster onboarding", () => {
  it("lets a player request to join and only the target captain approve it", async () => {
    const { season, home, captain, awayCaptain } = await fixture();
    const player = await user("player", { player: true });
    const request = await createJoinRequest(prisma, {
      seasonId: season.id,
      teamId: home.id,
      requesterId: player.id,
      message: "I play midfield.",
    });

    await expect(
      decideJoinRequest(prisma, {
        requestId: request.id,
        actorId: awayCaptain.id,
        decision: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
    expect(await prisma.teamMembership.count()).toBe(0);

    await decideJoinRequest(prisma, {
      requestId: request.id,
      actorId: captain.id,
      decision: "ACCEPTED",
    });
    await expect(
      prisma.teamMembership.findUniqueOrThrow({
        where: { seasonId_userId: { seasonId: season.id, userId: player.id } },
      }),
    ).resolves.toMatchObject({ teamId: home.id, status: "ACTIVE" });
    expect(
      await prisma.notification.count({
        where: { userId: player.id, type: "ROSTER_JOIN_ACCEPTED" },
      }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "roster.join_request.accepted", entityId: request.id },
      }),
    ).toBe(1);
  });

  it("rejects duplicate open requests and supports sender cancellation", async () => {
    const { season, home } = await fixture();
    const player = await user("player", { player: true });
    const request = await createJoinRequest(prisma, {
      seasonId: season.id,
      teamId: home.id,
      requesterId: player.id,
    });

    await expect(
      createJoinRequest(prisma, {
        seasonId: season.id,
        teamId: home.id,
        requesterId: player.id,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPEN" } satisfies Partial<RosterError>);

    const cancelled = await cancelJoinRequest(prisma, {
      requestId: request.id,
      actorId: player.id,
    });
    expect(cancelled.status).toBe("CANCELLED");
  });

  it("creates no membership until the invited player accepts", async () => {
    const { season, home, captain } = await fixture();
    const invitation = await createRosterInvitation(prisma, {
      seasonId: season.id,
      teamId: home.id,
      invitedById: captain.id,
      email: "new-player@example.com",
    });
    expect(await prisma.teamMembership.count()).toBe(0);

    const player = await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-new-player",
      email: "new-player@example.com",
      displayName: "New Player",
    });
    await respondToRosterInvitation(prisma, {
      invitationId: invitation.id,
      actorId: player.id,
      decision: "ACCEPTED",
    });
    expect(await prisma.teamMembership.count()).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: captain.id, type: "ROSTER_INVITATION_ACCEPTED" },
      }),
    ).toBe(1);
  });

  it("prevents duplicate invitations and limits cancellation to the sender or Admin", async () => {
    const { season, home, captain, awayCaptain } = await fixture();
    const admin = await user("admin", { admin: true });
    const invitation = await createRosterInvitation(prisma, {
      seasonId: season.id,
      teamId: home.id,
      invitedById: captain.id,
      email: "invited-player@example.com",
    });

    await expect(
      createRosterInvitation(prisma, {
        seasonId: season.id,
        teamId: home.id,
        invitedById: captain.id,
        email: "INVITED-PLAYER@EXAMPLE.COM",
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE_OPEN" } satisfies Partial<RosterError>);
    await expect(
      cancelRosterInvitation(prisma, {
        invitationId: invitation.id,
        actorId: awayCaptain.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
    await expect(
      cancelRosterInvitation(prisma, { invitationId: invitation.id, actorId: captain.id }),
    ).resolves.toMatchObject({ status: "CANCELLED" });

    const adminCancelled = await createRosterInvitation(prisma, {
      seasonId: season.id,
      teamId: home.id,
      invitedById: captain.id,
      email: "invited-player@example.com",
    });
    await expect(
      cancelRosterInvitation(prisma, { invitationId: adminCancelled.id, actorId: admin.id }),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("links a pending e-mail invitation when the identity is claimed", async () => {
    const { season, home, captain } = await fixture();
    const invitation = await createRosterInvitation(prisma, {
      seasonId: season.id,
      teamId: home.id,
      invitedById: captain.id,
      email: " Future.Player@Example.com ",
    });
    const provisional = await prisma.appUser.findUniqueOrThrow({
      where: { normalizedEmail: "future.player@example.com" },
    });
    expect(provisional.status).toBe("PROVISIONAL");

    const claimed = await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-future-player",
      email: "future.player@example.com",
      displayName: "Future Player",
    });
    expect(claimed.id).toBe(provisional.id);
    await respondToRosterInvitation(prisma, {
      invitationId: invitation.id,
      actorId: claimed.id,
      decision: "ACCEPTED",
    });
    expect(
      await prisma.teamMembership.count({
        where: { seasonId: season.id, userId: claimed.id, teamId: home.id },
      }),
    ).toBe(1);
  });

  it("rejects invitation acceptance by another identity", async () => {
    const { season, home, captain } = await fixture();
    const intruder = await user("intruder", { player: true });
    const invitation = await createRosterInvitation(prisma, {
      seasonId: season.id,
      teamId: home.id,
      invitedById: captain.id,
      email: "invited@example.com",
    });
    await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-invited",
      email: "invited@example.com",
      displayName: "Invited Player",
    });

    await expect(
      respondToRosterInvitation(prisma, {
        invitationId: invitation.id,
        actorId: intruder.id,
        decision: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
  });

  it("rejects manual invitations for existing users", async () => {
    const { season, home, captain, awayCaptain } = await fixture();
    await expect(
      createRosterInvitation(prisma, {
        seasonId: season.id,
        teamId: home.id,
        invitedById: captain.id,
        email: awayCaptain.email,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining("existing user"),
    } satisfies Partial<RosterError>);
    expect(await prisma.rosterInvitation.count()).toBe(0);
  });

  it("allows only one of two competing cross-team invitations to activate membership", async () => {
    const { season, home, away, captain, awayCaptain } = await fixture();
    const [homeInvite, awayInvite] = await Promise.all([
      createRosterInvitation(prisma, {
        seasonId: season.id,
        teamId: home.id,
        invitedById: captain.id,
        email: "racing-player@example.com",
      }),
      createRosterInvitation(prisma, {
        seasonId: season.id,
        teamId: away.id,
        invitedById: awayCaptain.id,
        email: "racing-player@example.com",
      }),
    ]);
    const player = await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-racing-player",
      email: "racing-player@example.com",
      displayName: "Racing Player",
    });

    await respondToRosterInvitation(prisma, {
      invitationId: homeInvite.id,
      actorId: player.id,
      decision: "ACCEPTED",
    });
    await expect(
      respondToRosterInvitation(prisma, {
        invitationId: awayInvite.id,
        actorId: player.id,
        decision: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" } satisfies Partial<RosterError>);
    expect(
      await prisma.teamMembership.count({
        where: { seasonId: season.id, userId: player.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });

  it("supports rejection without membership creation", async () => {
    const { season, home, captain } = await fixture();
    const player = await user("rejected-player", { player: true });
    const [request, invitation] = await Promise.all([
      createJoinRequest(prisma, {
        seasonId: season.id,
        teamId: home.id,
        requesterId: player.id,
      }),
      createRosterInvitation(prisma, {
        seasonId: season.id,
        teamId: home.id,
        invitedById: captain.id,
        email: "future-rejected-player@example.com",
      }),
    ]);
    const invited = await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-future-rejected-player",
      email: "future-rejected-player@example.com",
      displayName: "Future Rejected Player",
    });
    await decideJoinRequest(prisma, {
      requestId: request.id,
      actorId: captain.id,
      decision: "REJECTED",
    });
    await respondToRosterInvitation(prisma, {
      invitationId: invitation.id,
      actorId: invited.id,
      decision: "REJECTED",
    });
    expect(await prisma.teamMembership.count()).toBe(0);
  });
});

describe("roster lifecycle", () => {
  it("supports promotion, last-captain self-demotion, and a Captainless team", async () => {
    const { season, home, captain } = await fixture();
    const player = await user("promoted-player", { player: true });
    const admin = await user("admin", { admin: true });
    const membership = await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: home.id, userId: player.id },
    });

    const promoted = await promoteRosterMember(prisma, {
      membershipId: membership.id,
      actorId: captain.id,
    });
    await demoteRosterCaptain(prisma, { captainId: promoted.id, actorId: player.id });
    const original = await prisma.teamCaptain.findFirstOrThrow({
      where: { seasonId: season.id, teamId: home.id, userId: captain.id },
    });
    await demoteRosterCaptain(prisma, { captainId: original.id, actorId: captain.id });

    expect(
      await prisma.teamCaptain.count({
        where: { seasonId: season.id, teamId: home.id, status: "ACTIVE", revokedAt: null },
      }),
    ).toBe(0);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: original.id, action: "roster.captain.demote" },
    });
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({ teamBecameCaptainless: true });
    expect(
      await prisma.notification.count({
        where: { userId: admin.id, type: "ROSTER_CAPTAINLESS" },
      }),
    ).toBe(1);
  });

  it("lets a captain leave and revokes their assignment even when they are last", async () => {
    const { season, home, captain } = await fixture();
    const membership = await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: home.id, userId: captain.id },
    });

    await leaveRoster(prisma, { membershipId: membership.id, actorId: captain.id });
    await expect(
      prisma.teamMembership.findUniqueOrThrow({ where: { id: membership.id } }),
    ).resolves.toMatchObject({ status: "ENDED", endedAt: expect.any(Date) });
    expect(
      await prisma.teamCaptain.count({
        where: { seasonId: season.id, teamId: home.id, status: "ACTIVE", revokedAt: null },
      }),
    ).toBe(0);
  });

  it("lets a captain remove a player and Admin remove a captain across teams", async () => {
    const { season, home, away, captain, awayCaptain } = await fixture();
    const player = await user("member", { player: true });
    const admin = await user("admin", { admin: true });
    const homeMembership = await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: home.id, userId: player.id },
    });
    await removeRosterMember(prisma, {
      membershipId: homeMembership.id,
      actorId: captain.id,
    });
    await expect(
      prisma.teamMembership.findUniqueOrThrow({ where: { id: homeMembership.id } }),
    ).resolves.toMatchObject({ status: "REMOVED" });

    const awayMembership = await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: away.id, userId: awayCaptain.id },
    });
    await removeRosterMember(prisma, {
      membershipId: awayMembership.id,
      actorId: admin.id,
    });
    expect(
      await prisma.teamCaptain.count({
        where: { seasonId: season.id, teamId: away.id, status: "ACTIVE", revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await prisma.notification.count({
        where: { userId: awayCaptain.id, type: "ROSTER_REMOVED" },
      }),
    ).toBe(1);
  });

  it("prevents a captain from mutating another team's roster", async () => {
    const { season, away, captain } = await fixture();
    const player = await user("away-member", { player: true });
    const membership = await prisma.teamMembership.create({
      data: { seasonId: season.id, teamId: away.id, userId: player.id },
    });

    await expect(
      removeRosterMember(prisma, { membershipId: membership.id, actorId: captain.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
    await expect(
      promoteRosterMember(prisma, { membershipId: membership.id, actorId: captain.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
  });
});
