import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { auth } from "@/auth";
import { updateTeamProfileAction } from "@/app/captain/teams/[id]/profile/actions";

const prisma = new PrismaClient();

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

async function resetDatabase() {
  await prisma.teamCaptain.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.appUser.deleteMany();
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Profile Season",
      slug: "profile-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
      isActive: true,
    },
  });
  const division = await prisma.division.create({
    data: { name: "Profile Division", slug: "profile-division" },
  });
  const first = await prisma.team.create({
    data: { divisionId: division.id, name: "First", slug: "profile-first", shortName: "FIRST" },
  });
  const second = await prisma.team.create({
    data: { divisionId: division.id, name: "Second", slug: "profile-second", shortName: "SECOND" },
  });
  return { season, first, second };
}

function mockSession(user: {
  id: string;
  entraObjectId: string;
  email: string;
  displayName: string;
}) {
  const mockedAuth = auth as unknown as ReturnType<typeof vi.fn>;
  mockedAuth.mockResolvedValue({
    user: {
      id: user.entraObjectId,
      appUserId: user.id,
      name: user.displayName,
      email: user.email,
      image: null,
      roles: ["viewer"],
      teamContexts: [],
      isPlayer: false,
      isCaptain: false,
      isReferee: false,
      isAdmin: false,
      isDevBypass: true,
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });
}

function form(teamId: string) {
  const data = new FormData();
  data.set("teamId", teamId);
  data.set("name", "Renamed Club");
  data.set("shortName", "RENAMED");
  data.set("colorPrimary", "#112233");
  data.set("colorAlternate", "#ddeeff");
  return data;
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("team profile authorization", () => {
  it("allows a Captain to update only an assigned team", async () => {
    const { season, first, second } = await fixture();
    const captain = await prisma.appUser.create({
      data: {
        entraObjectId: "profile-captain",
        email: "profile-captain@example.com",
        normalizedEmail: "profile-captain@example.com",
        displayName: "Profile Captain",
        status: "ACTIVE",
      },
    });
    await prisma.teamCaptain.create({
      data: {
        teamId: first.id,
        seasonId: season.id,
        userId: captain.id,
        name: captain.displayName,
        status: "ACTIVE",
      },
    });
    mockSession(captain as typeof captain & { entraObjectId: string });

    await expect(updateTeamProfileAction({}, form(first.id))).resolves.toMatchObject({
      ok: "Team profile updated.",
    });
    await expect(updateTeamProfileAction({}, form(second.id))).resolves.toMatchObject({
      error: "Captain access for this team and season is required.",
    });
    await expect(prisma.team.findUniqueOrThrow({ where: { id: first.id } })).resolves.toMatchObject({
      name: "Renamed Club",
    });
  });

  it("allows an Admin to update any team without changing its slug", async () => {
    const { second } = await fixture();
    const admin = await prisma.appUser.create({
      data: {
        entraObjectId: "profile-admin",
        email: "profile-admin@example.com",
        normalizedEmail: "profile-admin@example.com",
        displayName: "Profile Admin",
        status: "ACTIVE",
        rolesAssigned: { create: { role: "ADMIN" } },
      },
    });
    mockSession(admin as typeof admin & { entraObjectId: string });

    await expect(updateTeamProfileAction({}, form(second.id))).resolves.toMatchObject({
      ok: "Team profile updated.",
    });
    await expect(prisma.team.findUniqueOrThrow({ where: { id: second.id } })).resolves.toMatchObject({
      name: "Renamed Club",
      slug: "profile-second",
    });
  });

  it("rejects a signed-in user without Admin or team Captain authority", async () => {
    const { first } = await fixture();
    const viewer = await prisma.appUser.create({
      data: {
        entraObjectId: "profile-viewer",
        email: "profile-viewer@example.com",
        normalizedEmail: "profile-viewer@example.com",
        displayName: "Profile Viewer",
        status: "ACTIVE",
      },
    });
    mockSession(viewer as typeof viewer & { entraObjectId: string });

    await expect(updateTeamProfileAction({}, form(first.id))).resolves.toMatchObject({
      error: "Captain access is required.",
    });
  });
});
