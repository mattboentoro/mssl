import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  CaptainFreeAgentError,
  listCaptainFreeAgents,
  placeFreeAgent,
} from "@/lib/captain-free-agents";
import { respondToRosterInvitation, RosterError } from "@/lib/roster";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.freeAgentRequest.deleteMany();
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

async function createUser(key: string) {
  return prisma.appUser.create({
    data: {
      entraObjectId: `entra-${key}`,
      email: `${key}@example.com`,
      normalizedEmail: `${key}@example.com`,
      displayName: key,
      status: "ACTIVE",
      rolesAssigned: { create: { role: "PLAYER" } },
    },
  });
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Active season",
      slug: "captain-free-agents",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
      isActive: true,
    },
  });
  const [preferredDivision, otherDivision] = await Promise.all([
    prisma.division.create({
      data: { name: "Premier", slug: "free-agent-premier", sortOrder: 1 },
    }),
    prisma.division.create({
      data: { name: "Second", slug: "free-agent-second", sortOrder: 2 },
    }),
  ]);
  const [home, away] = await Promise.all([
    prisma.team.create({
      data: {
        divisionId: preferredDivision.id,
        name: "Home",
        slug: "free-agent-home",
        shortName: "HOME",
      },
    }),
    prisma.team.create({
      data: {
        divisionId: otherDivision.id,
        name: "Away",
        slug: "free-agent-away",
        shortName: "AWAY",
      },
    }),
  ]);
  await prisma.seasonTeam.createMany({
    data: [
      { seasonId: season.id, teamId: home.id, divisionId: preferredDivision.id },
      { seasonId: season.id, teamId: away.id, divisionId: otherDivision.id },
    ],
  });
  const [captain, coCaptain, awayCaptain, player, outsider] = await Promise.all([
    createUser("captain"),
    createUser("co-captain"),
    createUser("away-captain"),
    createUser("free-player"),
    createUser("outsider"),
  ]);
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
        teamId: home.id,
        userId: coCaptain.id,
        name: coCaptain.displayName,
        email: coCaptain.email,
        normalizedEmail: coCaptain.normalizedEmail,
        status: "ACTIVE",
        activatedAt: new Date(),
        sortOrder: 1,
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
  const request = await prisma.freeAgentRequest.create({
    data: {
      submittedById: player.id,
      submittedByName: "Free Player",
      submittedByEmail: player.normalizedEmail,
      yearsExperience: 7,
      preferredPosition: "MIDFIELDER",
      preferredDivisionId: preferredDivision.id,
      notes: "Available Tuesdays and Thursdays.",
    },
  });
  return {
    season,
    preferredDivision,
    otherDivision,
    home,
    away,
    captain,
    coCaptain,
    awayCaptain,
    player,
    outsider,
    request,
  };
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("Captain free-agent access", () => {
  it("requires an active Captain assignment and audits contact-data access without PII", async () => {
    const fx = await fixture();
    await expect(listCaptainFreeAgents(prisma, { actorId: fx.outsider.id })).rejects.toMatchObject({
      code: "FORBIDDEN",
    } satisfies Partial<CaptainFreeAgentError>);

    const result = await listCaptainFreeAgents(prisma, { actorId: fx.captain.id });
    expect(result.assignments.map(({ teamId }) => teamId)).toEqual([fx.home.id]);
    expect(result.requests[0]).toMatchObject({
      submittedByName: "Free Player",
      submittedByEmail: fx.player.email,
      yearsExperience: 7,
      preferredPosition: "MIDFIELDER",
      preferredDivisionId: fx.preferredDivision.id,
      notes: "Available Tuesdays and Thursdays.",
      status: "PENDING",
      preferredDivision: { name: "Premier" },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "free_agent.contact_data.view" },
    });
    expect(audit.metadata).not.toContain(fx.player.email);
    expect(JSON.parse(audit.metadata ?? "{}")).toMatchObject({
      status: "open",
      resultCount: 1,
    });
  });

  it("filters requests by status and preferred division", async () => {
    const fx = await fixture();
    await prisma.freeAgentRequest.create({
      data: {
        submittedByName: "Placed Player",
        submittedByEmail: "placed@example.com",
        yearsExperience: 1,
        preferredPosition: "ANY",
        preferredDivisionId: fx.otherDivision.id,
        status: "PLACED",
      },
    });
    expect(
      (
        await listCaptainFreeAgents(prisma, {
          actorId: fx.captain.id,
          filters: { status: "PLACED", divisionId: fx.otherDivision.id },
        })
      ).requests.map(({ submittedByName }) => submittedByName),
    ).toEqual(["Placed Player"]);
  });
});

describe("Captain free-agent placement", () => {
  it("hands placement off as an invitation and marks PLACED only on acceptance", async () => {
    const fx = await fixture();
    const invitation = await placeFreeAgent(prisma, {
      actorId: fx.captain.id,
      requestId: fx.request.id,
      seasonId: fx.season.id,
      teamId: fx.home.id,
    });
    expect(await prisma.teamMembership.count()).toBe(0);
    await expect(
      prisma.freeAgentRequest.findUniqueOrThrow({ where: { id: fx.request.id } }),
    ).resolves.toMatchObject({ status: "PENDING" });
    expect(
      await prisma.notification.count({
        where: { userId: fx.player.id, type: "ROSTER_INVITATION" },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: fx.coCaptain.id, type: "FREE_AGENT_INVITED" },
      }),
    ).toBe(1);

    await respondToRosterInvitation(prisma, {
      actorId: fx.player.id,
      invitationId: invitation.id,
      decision: "ACCEPTED",
    });
    await expect(
      prisma.freeAgentRequest.findUniqueOrThrow({ where: { id: fx.request.id } }),
    ).resolves.toMatchObject({ status: "PLACED", reviewedByEmail: fx.captain.email });
    expect(
      await prisma.teamMembership.count({
        where: { userId: fx.player.id, teamId: fx.home.id, status: "ACTIVE" },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: fx.coCaptain.id, type: "FREE_AGENT_PLACED" },
      }),
    ).toBe(1);
    const audits = await prisma.auditLog.findMany({
      where: { action: { startsWith: "free_agent.placement." } },
      orderBy: { createdAt: "asc" },
    });
    expect(audits.map(({ action }) => action)).toEqual([
      "free_agent.placement.invited",
      "free_agent.placement.accepted",
    ]);
    expect(audits.every(({ metadata }) => !metadata?.includes(fx.player.email))).toBe(true);
  });

  it("isolates placement to the Captain's own team", async () => {
    const fx = await fixture();
    await expect(
      placeFreeAgent(prisma, {
        actorId: fx.captain.id,
        requestId: fx.request.id,
        seasonId: fx.season.id,
        teamId: fx.away.id,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" } satisfies Partial<RosterError>);
    expect(await prisma.rosterInvitation.count()).toBe(0);
  });

  it("prevents placement when the player is already rostered to another team", async () => {
    const fx = await fixture();
    await prisma.teamMembership.create({
      data: {
        seasonId: fx.season.id,
        teamId: fx.away.id,
        userId: fx.player.id,
        assignedById: fx.awayCaptain.id,
      },
    });
    await expect(
      placeFreeAgent(prisma, {
        actorId: fx.captain.id,
        requestId: fx.request.id,
        seasonId: fx.season.id,
        teamId: fx.home.id,
      }),
    ).rejects.toMatchObject({ code: "ALREADY_ROSTERED" } satisfies Partial<RosterError>);
  });

  it("keeps one accepted team and one PLACED transition across competing invitations", async () => {
    const fx = await fixture();
    const homeInvitation = await placeFreeAgent(prisma, {
      actorId: fx.captain.id,
      requestId: fx.request.id,
      seasonId: fx.season.id,
      teamId: fx.home.id,
    });
    const awayInvitation = await placeFreeAgent(prisma, {
      actorId: fx.awayCaptain.id,
      requestId: fx.request.id,
      seasonId: fx.season.id,
      teamId: fx.away.id,
    });

    await respondToRosterInvitation(prisma, {
      actorId: fx.player.id,
      invitationId: homeInvitation.id,
      decision: "ACCEPTED",
    });
    await expect(
      respondToRosterInvitation(prisma, {
        actorId: fx.player.id,
        invitationId: awayInvitation.id,
        decision: "ACCEPTED",
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" } satisfies Partial<RosterError>);
    expect(
      await prisma.auditLog.count({ where: { action: "free_agent.placement.accepted" } }),
    ).toBe(1);
    expect(
      await prisma.teamMembership.count({
        where: { seasonId: fx.season.id, userId: fx.player.id, status: "ACTIVE" },
      }),
    ).toBe(1);
  });
});
