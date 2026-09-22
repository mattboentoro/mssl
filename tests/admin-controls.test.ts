import fs from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  AdminRosterError,
  isActiveCaptainForSeason,
  relinkCaptainIdentity,
} from "@/lib/admin-roster";
import { loadAuthorization } from "@/lib/rbac";

const prisma = new PrismaClient();
const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

beforeEach(async () => {
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
});

afterAll(() => prisma.$disconnect());

describe("Admin RBAC operational controls", () => {
  it("keeps every review queue reachable and routes actions through authorized domain transitions", () => {
    const layout = source("src/app/admin/layout.tsx");
    const matches = source("src/app/admin/matches/page.tsx");
    const detail = source("src/app/admin/matches/[id]/page.tsx");
    const actions = source("src/app/admin/workflows/actions.ts");

    expect(layout).toContain("/admin/workflows");
    expect(matches).toContain("/admin/workflows");
    expect(detail).toContain("/admin/workflows");
    expect(actions).toContain("requireAdmin()");
    expect(actions).toContain("reviewRescheduleAsAdmin");
    expect(actions).toContain("reviewCaptainResult");
    expect(actions).toContain("acceptScoreAppeal");
    expect(actions).toContain("rejectScoreAppeal");
  });

  it("binds a seasonless legacy Captain to a valid team-season and grants scoped access", async () => {
    const season = await prisma.season.create({
      data: {
        name: "Admin Season",
        slug: "admin-season",
        startsOn: new Date("2026-01-01"),
        endsOn: new Date("2026-12-31"),
      },
    });
    const division = await prisma.division.create({
      data: { name: "Admin Division", slug: "admin-division" },
    });
    const team = await prisma.team.create({
      data: { name: "Captainless", slug: "captainless", shortName: "CAP", divisionId: division.id },
    });
    const actor = await prisma.appUser.create({
      data: {
        email: "admin@example.com",
        normalizedEmail: "admin@example.com",
        displayName: "Admin",
        status: "ACTIVE",
      },
    });
    const identity = await prisma.appUser.create({
      data: {
        entraObjectId: "legacy-entra",
        email: "legacy@example.com",
        normalizedEmail: "legacy@example.com",
        displayName: "Legacy Captain",
        status: "ACTIVE",
      },
    });
    await prisma.seasonTeam.create({
      data: { seasonId: season.id, teamId: team.id, divisionId: division.id },
    });
    const legacy = await prisma.teamCaptain.create({
      data: { teamId: team.id, seasonId: null, name: "Legacy", status: "PENDING" },
    });

    const linked = await relinkCaptainIdentity(prisma, {
      captainId: legacy.id,
      seasonId: season.id,
      expectedUpdatedAt: legacy.updatedAt.toISOString(),
      name: "Legacy Captain",
      email: "legacy@example.com",
      actor: { appUserId: actor.id },
    });
    expect(linked).toMatchObject({
      seasonId: season.id,
      userId: identity.id,
      status: "ACTIVE",
      normalizedEmail: "legacy@example.com",
    });
    expect(await loadAuthorization(prisma, identity.id)).toMatchObject({
      roles: expect.arrayContaining(["captain"]),
      teamContexts: [{ seasonId: season.id, teamId: team.id, role: "captain" }],
    });
    expect(await prisma.teamMembership.count()).toBe(0);
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { action: "captain.identity_relink", entityId: legacy.id },
      }),
    ).resolves.toMatchObject({ actorId: actor.id });
  });

  it("does not let an active seasonless legacy record mask a Captainless team", () => {
    expect(
      isActiveCaptainForSeason(
        { seasonId: null, status: "ACTIVE", user: { status: "ACTIVE" } },
        "season-1",
      ),
    ).toBe(false);
    expect(source("src/app/admin/roster/page.tsx")).toContain("Captainless");
  });

  it("rejects a stale relink after revocation without reactivating the Captain", async () => {
    const season = await prisma.season.create({
      data: {
        name: "Stale Season",
        slug: "stale-season",
        startsOn: new Date("2026-01-01"),
        endsOn: new Date("2026-12-31"),
      },
    });
    const division = await prisma.division.create({
      data: { name: "Stale Division", slug: "stale-division" },
    });
    const team = await prisma.team.create({
      data: { name: "Stale Team", slug: "stale-team", shortName: "STL", divisionId: division.id },
    });
    await prisma.seasonTeam.create({
      data: { seasonId: season.id, teamId: team.id, divisionId: division.id },
    });
    const actor = await prisma.appUser.create({
      data: {
        email: "admin@example.com",
        normalizedEmail: "admin@example.com",
        displayName: "Admin",
        status: "ACTIVE",
      },
    });
    const legacy = await prisma.teamCaptain.create({
      data: { teamId: team.id, name: "Legacy", status: "PENDING" },
    });
    await prisma.teamCaptain.update({
      where: { id: legacy.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    await expect(
      relinkCaptainIdentity(prisma, {
        captainId: legacy.id,
        seasonId: season.id,
        expectedUpdatedAt: legacy.updatedAt.toISOString(),
        name: "Stale Captain",
        email: "stale@example.com",
        actor: { appUserId: actor.id },
      }),
    ).rejects.toMatchObject({
      code: "RELINK_CONFLICT",
    } satisfies Partial<AdminRosterError>);
    await expect(
      prisma.teamCaptain.findUniqueOrThrow({ where: { id: legacy.id } }),
    ).resolves.toMatchObject({ status: "REVOKED", revokedAt: expect.any(Date), userId: null });
  });

  it("keeps raw rating identity and comments in the Admin-only page", () => {
    const adminLayout = source("src/app/admin/layout.tsx");
    const adminRatings = source("src/app/admin/ratings/page.tsx");
    const refereeRatings = source("src/app/referee/ratings/page.tsx");
    expect(adminLayout).toContain("requireAdmin");
    expect(adminRatings).toContain("rating.comment");
    expect(adminRatings).toContain("rating.ratedBy");
    expect(refereeRatings).not.toContain("rating.comment");
    expect(refereeRatings).not.toContain("ratedBy");
  });
});
