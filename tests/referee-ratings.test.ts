import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  MAX_RATING_COMMENT_LENGTH,
  RatingError,
  getRefereeRatingAggregate,
  listRefereeRatingsForAdmin,
  saveRefereeRating,
} from "@/lib/referee-ratings";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.refereeRating.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.teamCaptain.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.teamMembership.deleteMany();
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
    },
  });
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Ratings Season",
      slug: "ratings-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
  });
  const division = await prisma.division.create({
    data: { name: "Ratings Division", slug: "ratings-division" },
  });
  const [home, away, other] = await Promise.all(
    ["Home", "Away", "Other"].map((name) =>
      prisma.team.create({
        data: {
          divisionId: division.id,
          name,
          slug: `ratings-${name.toLowerCase()}`,
          shortName: name.slice(0, 3).toUpperCase(),
        },
      }),
    ),
  );
  const [captainA, captainB, awayCaptain, outsider] = await Promise.all([
    createUser("captain-a"),
    createUser("captain-b"),
    createUser("away-captain"),
    createUser("outsider"),
  ]);
  await prisma.teamCaptain.createMany({
    data: [
      {
        seasonId: season.id,
        teamId: home.id,
        userId: captainA.id,
        name: captainA.displayName,
        status: "ACTIVE",
        sortOrder: 0,
      },
      {
        seasonId: season.id,
        teamId: home.id,
        userId: captainB.id,
        name: captainB.displayName,
        status: "ACTIVE",
        sortOrder: 1,
      },
      {
        seasonId: season.id,
        teamId: away.id,
        userId: awayCaptain.id,
        name: awayCaptain.displayName,
        status: "ACTIVE",
        sortOrder: 0,
      },
      {
        seasonId: season.id,
        teamId: other.id,
        userId: outsider.id,
        name: outsider.displayName,
        status: "ACTIVE",
        sortOrder: 0,
      },
    ],
  });
  const referee = await prisma.referee.create({
    data: { name: "Rated Referee", email: "rated-referee@example.com" },
  });
  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      divisionId: division.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: new Date("2026-03-01T18:00:00Z"),
      matchweek: "1",
      status: "SCHEDULED",
    },
  });
  const actor = (user: typeof captainA) => ({
    appUserId: user.id,
    email: user.email,
    name: user.displayName,
  });
  return {
    season,
    division,
    home,
    away,
    other,
    captainA,
    captainB,
    awayCaptain,
    outsider,
    referee,
    match,
    actor,
  };
}

async function fileOfficialResult(fx: Awaited<ReturnType<typeof fixture>>, matchId = fx.match.id) {
  await prisma.match.update({
    where: { id: matchId },
    data: { refereeId: fx.referee.id, status: "REPORT_SUBMITTED" },
  });
  await prisma.gameReport.create({
    data: {
      matchId,
      refereeId: fx.referee.id,
      homeScore: 2,
      awayScore: 1,
      status: "SUBMITTED",
    },
  });
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("referee ratings", () => {
  it("rejects non-captains, captains of another team, and non-participating teams", async () => {
    const fx = await fixture();
    await fileOfficialResult(fx);
    const nonCaptain = await createUser("non-captain");

    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.home.id,
        rating: 4,
        actor: fx.actor(nonCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.home.id,
        rating: 4,
        actor: fx.actor(fx.outsider),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.other.id,
        rating: 4,
        actor: fx.actor(fx.outsider),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  });

  it("rejects matches without a referee-filed official result", async () => {
    const fx = await fixture();
    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.home.id,
        rating: 4,
        actor: fx.actor(fx.captainA),
      }),
    ).rejects.toMatchObject({ code: "RATING_NOT_ELIGIBLE", status: 409 });

    await prisma.match.update({
      where: { id: fx.match.id },
      data: { refereeId: fx.referee.id, status: "ASSIGNED" },
    });
    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.home.id,
        rating: 4,
        actor: fx.actor(fx.captainA),
      }),
    ).rejects.toMatchObject({ code: "RATING_NOT_ELIGIBLE", status: 409 });
  });

  it("enforces star and private-comment bounds", async () => {
    const fx = await fixture();
    await fileOfficialResult(fx);

    for (const rating of [0, 1.5, 6]) {
      await expect(
        saveRefereeRating(prisma, {
          matchId: fx.match.id,
          teamId: fx.home.id,
          rating,
          actor: fx.actor(fx.captainA),
        }),
      ).rejects.toBeInstanceOf(RatingError);
    }
    await expect(
      saveRefereeRating(prisma, {
        matchId: fx.match.id,
        teamId: fx.home.id,
        rating: 5,
        comment: "x".repeat(MAX_RATING_COMMENT_LENGTH + 1),
        actor: fx.actor(fx.captainA),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", status: 422 });
  });

  it("keeps one team rating and lets a co-Captain replace it with their identity", async () => {
    const fx = await fixture();
    await fileOfficialResult(fx);
    await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.home.id,
      rating: 2,
      comment: "First private note",
      actor: fx.actor(fx.captainA),
    });
    const updated = await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.home.id,
      rating: 5,
      comment: " Replacement private note ",
      actor: fx.actor(fx.captainB),
    });

    expect(await prisma.refereeRating.count()).toBe(1);
    expect(updated).toMatchObject({
      rating: 5,
      comment: "Replacement private note",
      ratedById: fx.captainB.id,
    });
  });

  it("returns only average/count to referees while Admin details retain private accountability", async () => {
    const fx = await fixture();
    await fileOfficialResult(fx);
    await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.home.id,
      rating: 3,
      comment: "Private home note",
      actor: fx.actor(fx.captainA),
    });
    await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.away.id,
      rating: 5,
      comment: "Private away note",
      actor: fx.actor(fx.awayCaptain),
    });

    const aggregate = await getRefereeRatingAggregate(prisma, fx.referee.id);
    expect(aggregate).toEqual({ average: 4, count: 2 });
    expect(Object.keys(aggregate).sort()).toEqual(["average", "count"]);

    const adminRatings = await listRefereeRatingsForAdmin(prisma);
    expect(adminRatings).toHaveLength(2);
    expect(adminRatings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          team: expect.objectContaining({ name: "Home" }),
          ratedBy: expect.objectContaining({ email: fx.captainA.email }),
          rating: 3,
          comment: "Private home note",
        }),
      ]),
    );
  });

  it("audits creates and co-Captain updates with before/after actor accountability", async () => {
    const fx = await fixture();
    await fileOfficialResult(fx);
    await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.home.id,
      rating: 3,
      actor: fx.actor(fx.captainA),
    });
    await saveRefereeRating(prisma, {
      matchId: fx.match.id,
      teamId: fx.home.id,
      rating: 4,
      actor: fx.actor(fx.captainB),
    });

    const audit = await prisma.auditLog.findMany({
      where: { entity: "RefereeRating" },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((entry) => entry.action)).toEqual([
      "referee_rating.create",
      "referee_rating.update",
    ]);
    expect(audit[1]).toMatchObject({
      actorId: fx.captainB.id,
      actorEmail: fx.captainB.email,
      actorRole: "captain",
    });
    expect(audit[1].metadata).toContain(`"ratedById":"${fx.captainA.id}"`);
    expect(audit[1].metadata).toContain(`"ratedById":"${fx.captainB.id}"`);
  });
});
