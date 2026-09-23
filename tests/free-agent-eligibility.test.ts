import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  getActiveTeamAssociation,
  requireFreeAgentEligibility,
} from "@/lib/free-agent-eligibility";

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.teamCaptain.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.appUser.deleteMany();
});

afterAll(async () => prisma.$disconnect());

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Eligibility Season",
      slug: "eligibility-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
  });
  const division = await prisma.division.create({
    data: { name: "Eligibility Division", slug: "eligibility-division" },
  });
  const team = await prisma.team.create({
    data: {
      divisionId: division.id,
      name: "Eligibility FC",
      slug: "eligibility-fc",
      shortName: "EFC",
    },
  });
  const user = await prisma.appUser.create({
    data: {
      entraObjectId: "eligibility-user",
      email: "eligibility@example.com",
      normalizedEmail: "eligibility@example.com",
      displayName: "Eligibility Player",
      status: "ACTIVE",
    },
  });
  return { season, team, user };
}

describe("free-agent team eligibility", () => {
  it("blocks an active roster member until the membership has ended", async () => {
    const fx = await fixture();
    const membership = await prisma.teamMembership.create({
      data: {
        seasonId: fx.season.id,
        teamId: fx.team.id,
        userId: fx.user.id,
        status: "ACTIVE",
      },
    });

    await expect(getActiveTeamAssociation(prisma, fx.user.id)).resolves.toEqual({
      id: fx.team.id,
      name: fx.team.name,
    });
    await expect(requireFreeAgentEligibility(prisma, fx.user.id)).rejects.toThrow(
      "Leave the team before signing up as a free agent.",
    );

    await prisma.teamMembership.update({
      where: { id: membership.id },
      data: { status: "LEFT", endedAt: new Date() },
    });
    await expect(requireFreeAgentEligibility(prisma, fx.user.id)).resolves.toBeUndefined();
  });

  it("also blocks an active Captain association and allows signup after revocation", async () => {
    const fx = await fixture();
    const captain = await prisma.teamCaptain.create({
      data: {
        seasonId: fx.season.id,
        teamId: fx.team.id,
        userId: fx.user.id,
        name: fx.user.displayName,
        email: fx.user.email,
        normalizedEmail: fx.user.normalizedEmail,
        status: "ACTIVE",
      },
    });

    await expect(requireFreeAgentEligibility(prisma, fx.user.id)).rejects.toThrow(fx.team.name);
    await prisma.teamCaptain.update({
      where: { id: captain.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await expect(requireFreeAgentEligibility(prisma, fx.user.id)).resolves.toBeUndefined();
  });
});
