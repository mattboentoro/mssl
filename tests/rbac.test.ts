import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { AuthzError, requireReferee } from "@/lib/authz";
import {
  assignGlobalRole,
  claimApplicationIdentity,
  loadAuthorization,
  revokeGlobalRole,
  RoleMutationError,
  setActiveTeamMembership,
} from "@/lib/rbac";

const prisma = new PrismaClient();

vi.mock("@/auth", () => ({ auth: vi.fn() }));

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

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "RBAC Season",
      slug: "rbac-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
  });
  const division = await prisma.division.create({
    data: { name: "RBAC Division", slug: "rbac-division" },
  });
  const home = await prisma.team.create({
    data: { divisionId: division.id, name: "Home", slug: "rbac-home", shortName: "HOME" },
  });
  const away = await prisma.team.create({
    data: { divisionId: division.id, name: "Away", slug: "rbac-away", shortName: "AWAY" },
  });
  return { season, home, away };
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("Captain RBAC foundation", () => {
  it("claims a provisional identity and links a legacy captain by normalized email", async () => {
    const { season, home } = await fixture();
    const provisional = await prisma.appUser.create({
      data: {
        email: " Captain@Example.com ",
        normalizedEmail: "captain@example.com",
        displayName: "Legacy Captain",
      },
    });
    await prisma.teamCaptain.create({
      data: {
        seasonId: season.id,
        teamId: home.id,
        userId: provisional.id,
        name: "Legacy Captain",
        email: "Captain@Example.com",
        normalizedEmail: "captain@example.com",
      },
    });

    const claimed = await claimApplicationIdentity(prisma, {
      entraObjectId: "entra-captain-1",
      email: "captain@example.com",
      displayName: "Captain Claimed",
    });

    expect(claimed.id).toBe(provisional.id);
    expect(claimed.entraObjectId).toBe("entra-captain-1");
    expect(claimed.status).toBe("ACTIVE");
    await expect(
      prisma.teamCaptain.findFirstOrThrow({ where: { userId: claimed.id } }),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("assigns and revokes independent global roles with actor metadata", async () => {
    const actor = await prisma.appUser.create({
      data: {
        entraObjectId: "actor",
        email: "actor@example.com",
        normalizedEmail: "actor@example.com",
        displayName: "Actor",
        status: "ACTIVE",
      },
    });

    const user = await prisma.appUser.create({
      data: {
        entraObjectId: "subject",
        email: "subject@example.com",
        normalizedEmail: "subject@example.com",
        displayName: "Subject",
        status: "ACTIVE",
      },
    });

    await assignGlobalRole(prisma, {
      userId: actor.id,
      role: "ADMIN",
      actorId: actor.id,
    });
    const assignment = await assignGlobalRole(prisma, {
      userId: user.id,
      role: "ADMIN",
      actorId: actor.id,
    });
    expect(assignment.assignedById).toBe(actor.id);
    expect((await loadAuthorization(prisma, user.id)).roles).toEqual(["viewer", "admin"]);
    await expect(
      revokeGlobalRole(prisma, { userId: user.id, role: "ADMIN", actorId: actor.id }),
    ).resolves.toBe(true);
    expect((await loadAuthorization(prisma, user.id)).roles).toEqual(["viewer"]);
    await expect(
      prisma.globalRoleAssignment.findUniqueOrThrow({
        where: { userId_role: { userId: user.id, role: "ADMIN" } },
      }),
    ).resolves.toMatchObject({ revokedById: actor.id, revokedAt: expect.any(Date) });
  });

  it("preserves other roles and prevents removing the last active Admin", async () => {
    const actor = await prisma.appUser.create({
      data: {
        entraObjectId: "sole-admin",
        email: "sole-admin@example.com",
        normalizedEmail: "sole-admin@example.com",
        displayName: "Sole Admin",
        status: "ACTIVE",
        rolesAssigned: { create: [{ role: "ADMIN" }, { role: "REFEREE" }] },
      },
    });

    await expect(
      revokeGlobalRole(prisma, { userId: actor.id, role: "ADMIN", actorId: actor.id }),
    ).rejects.toMatchObject({
      code: "LAST_ADMIN",
    } satisfies Partial<RoleMutationError>);
    expect((await loadAuthorization(prisma, actor.id)).roles).toEqual(
      expect.arrayContaining(["admin", "referee"]),
    );

    const second = await prisma.appUser.create({
      data: {
        entraObjectId: "second-admin",
        email: "second-admin@example.com",
        normalizedEmail: "second-admin@example.com",
        displayName: "Second Admin",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "ADMIN" } },
      },
    });
    await expect(
      revokeGlobalRole(prisma, { userId: actor.id, role: "ADMIN", actorId: second.id }),
    ).resolves.toBe(true);
    expect((await loadAuthorization(prisma, actor.id)).roles).toContain("referee");
  });

  it("serializes concurrent Admin revocations so one active Admin remains", async () => {
    const first = await prisma.appUser.create({
      data: {
        entraObjectId: "concurrent-admin-1",
        email: "concurrent-1@example.com",
        normalizedEmail: "concurrent-1@example.com",
        displayName: "Concurrent One",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "ADMIN" } },
      },
    });
    const second = await prisma.appUser.create({
      data: {
        entraObjectId: "concurrent-admin-2",
        email: "concurrent-2@example.com",
        normalizedEmail: "concurrent-2@example.com",
        displayName: "Concurrent Two",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "ADMIN" } },
      },
    });

    const results = await Promise.allSettled([
      revokeGlobalRole(prisma, { userId: first.id, role: "ADMIN", actorId: second.id }),
      revokeGlobalRole(prisma, { userId: second.id, role: "ADMIN", actorId: first.id }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    expect(rejected?.reason).toMatchObject({
      code: expect.stringMatching(/^(LAST_ADMIN|CONFLICT)$/),
    });
    expect(
      await prisma.globalRoleAssignment.count({
        where: { role: "ADMIN", revokedAt: null, user: { status: "ACTIVE" } },
      }),
    ).toBe(1);
  });

  it("composes multiple roles without hierarchy or implicit Referee access", async () => {
    const user = await prisma.appUser.create({
      data: {
        entraObjectId: "multi",
        email: "multi@example.com",
        normalizedEmail: "multi@example.com",
        displayName: "Multi",
        status: "ACTIVE",
        rolesAssigned: { create: [{ role: "ADMIN" }, { role: "PLAYER" }] },
      },
    });

    const snapshot = await loadAuthorization(prisma, user.id);
    expect(snapshot.roles).toEqual(expect.arrayContaining(["viewer", "player", "admin"]));
    expect(snapshot.roles).not.toContain("referee");
  });

  it("rejects an Admin who has not been explicitly assigned Referee", async () => {
    const user = await prisma.appUser.create({
      data: {
        entraObjectId: "admin-only",
        email: "admin@example.com",
        normalizedEmail: "admin@example.com",
        displayName: "Admin Only",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "ADMIN" } },
      },
    });
    const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
    mockedAuth.mockResolvedValue({
      user: {
        id: "admin-only",
        appUserId: user.id,
        name: user.displayName,
        email: user.email,
        image: null,
        roles: ["viewer", "admin"],
        teamContexts: [],
        isPlayer: false,
        isCaptain: false,
        isReferee: false,
        isAdmin: true,
        isDevBypass: true,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });

    await expect(requireReferee()).rejects.toMatchObject({
      status: 403,
      code: "FORBIDDEN",
      message: "An explicit Referee role is required.",
    } satisfies Partial<AuthzError>);
  });

  it("isolates Captain authority to the assigned team and season", async () => {
    const { season, home, away } = await fixture();
    const user = await prisma.appUser.create({
      data: {
        entraObjectId: "captain",
        email: "captain@example.com",
        normalizedEmail: "captain@example.com",
        displayName: "Captain",
        status: "ACTIVE",
      },
    });
    await prisma.teamCaptain.create({
      data: {
        seasonId: season.id,
        teamId: home.id,
        userId: user.id,
        name: user.displayName,
        status: "ACTIVE",
      },
    });

    const snapshot = await loadAuthorization(prisma, user.id);
    expect(snapshot.roles).toContain("captain");
    expect(snapshot.roles).toContain("player");
    expect(snapshot.teamContexts).toContainEqual({
      seasonId: season.id,
      teamId: home.id,
      role: "player",
    });
    expect(snapshot.teamContexts).toContainEqual({
      seasonId: season.id,
      teamId: home.id,
      role: "captain",
    });
    expect(snapshot.teamContexts.some((context) => context.teamId === away.id)).toBe(false);
  });

  it("enforces one active team per user per season by moving the membership", async () => {
    const { season, home, away } = await fixture();
    const user = await prisma.appUser.create({
      data: {
        entraObjectId: "player",
        email: "player@example.com",
        normalizedEmail: "player@example.com",
        displayName: "Player",
        status: "ACTIVE",
      },
    });

    await setActiveTeamMembership(prisma, {
      seasonId: season.id,
      teamId: home.id,
      userId: user.id,
    });
    await setActiveTeamMembership(prisma, {
      seasonId: season.id,
      teamId: away.id,
      userId: user.id,
    });

    expect(
      await prisma.teamMembership.count({ where: { seasonId: season.id, userId: user.id } }),
    ).toBe(1);
    await expect(
      prisma.teamMembership.findUniqueOrThrow({
        where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
      }),
    ).resolves.toMatchObject({ teamId: away.id, status: "ACTIVE" });
  });
});
