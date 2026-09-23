import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { acceptScoreAppeal, rejectScoreAppeal, submitScoreAppeal } from "@/lib/score-appeals";
import { calculateStandings } from "@/lib/standings";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.scoreAppeal.deleteMany();
  await prisma.refereeRating.deleteMany();
  await prisma.captainResultProposal.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.disciplinaryAction.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.teamCaptain.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.appUser.deleteMany();
}

async function createUser(key: string) {
  return prisma.appUser.create({
    data: {
      entraObjectId: `appeal-${key}`,
      email: `${key}@appeals.example.com`,
      normalizedEmail: `${key}@appeals.example.com`,
      displayName: key,
      status: "ACTIVE",
    },
  });
}

async function fixture() {
  const season = await prisma.season.create({
    data: {
      name: "Closed 2020 Season",
      slug: "appeals-closed-2020",
      startsOn: new Date("2020-01-01"),
      endsOn: new Date("2020-12-31"),
      isActive: false,
    },
  });
  const division = await prisma.division.create({
    data: { name: "Appeals Division", slug: "appeals-division" },
  });
  const [home, away, other] = await Promise.all(
    ["Home", "Away", "Other"].map((name) =>
      prisma.team.create({
        data: {
          divisionId: division.id,
          name: `${name} Appeals`,
          slug: `${name.toLowerCase()}-appeals`,
          shortName: name.slice(0, 3).toUpperCase(),
        },
      }),
    ),
  );
  const [homeCaptain, awayCaptain, outsider, admin, refereeUser, homePlayer, awayPlayer] =
    await Promise.all(
      [
        "home-captain",
        "away-captain",
        "outsider",
        "admin",
        "referee",
        "home-player",
        "away-player",
      ].map(createUser),
    );
  await prisma.globalRoleAssignment.create({
    data: { userId: admin.id, role: "ADMIN" },
  });
  await prisma.teamCaptain.createMany({
    data: [
      {
        seasonId: season.id,
        teamId: home.id,
        userId: homeCaptain.id,
        name: homeCaptain.displayName,
        status: "ACTIVE",
      },
      {
        seasonId: season.id,
        teamId: away.id,
        userId: awayCaptain.id,
        name: awayCaptain.displayName,
        status: "ACTIVE",
      },
      {
        seasonId: season.id,
        teamId: other.id,
        userId: outsider.id,
        name: outsider.displayName,
        status: "ACTIVE",
      },
    ],
  });
  await prisma.teamMembership.createMany({
    data: [
      { seasonId: season.id, teamId: home.id, userId: homePlayer.id, status: "ACTIVE" },
      { seasonId: season.id, teamId: away.id, userId: awayPlayer.id, status: "ACTIVE" },
    ],
  });
  const referee = await prisma.referee.create({
    data: {
      name: refereeUser.displayName,
      email: refereeUser.email,
      userId: refereeUser.id,
    },
  });
  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      divisionId: division.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      refereeId: referee.id,
      kickoffAt: new Date("2020-03-01T18:00:00Z"),
      matchweek: "1",
      status: "CONFIRMED",
      version: 7,
      report: {
        create: {
          refereeId: referee.id,
          homeScore: 1,
          awayScore: 0,
          status: "CONFIRMED",
          confirmedAt: new Date("2020-03-01T20:00:00Z"),
        },
      },
    },
    include: { report: true },
  });
  const actor = (user: typeof homeCaptain) => ({
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
    homeCaptain,
    awayCaptain,
    outsider,
    admin,
    refereeUser,
    homePlayer,
    awayPlayer,
    match,
    actor,
  };
}

async function appeal(
  fx: Awaited<ReturnType<typeof fixture>>,
  overrides: Partial<Parameters<typeof submitScoreAppeal>[1]> = {},
) {
  return submitScoreAppeal(prisma, {
    matchId: fx.match.id,
    teamId: fx.home.id,
    reason: "The entered score omitted our second goal.",
    requestedHomeScore: 2,
    requestedAwayScore: 0,
    actor: fx.actor(fx.homeCaptain),
    ...overrides,
  });
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("score appeals", () => {
  it("allows either participating Captain to appeal an old result in a closed season", async () => {
    const fx = await fixture();
    const homeAppeal = await appeal(fx);
    const awayAppeal = await appeal(fx, {
      teamId: fx.away.id,
      actor: fx.actor(fx.awayCaptain),
      reason: "The result should record an away-team forfeit.",
      requestedHomeScore: 0,
      requestedAwayScore: 0,
      requestedAwayForfeit: true,
    });

    expect(homeAppeal.originalHomeScore).toBe(1);
    expect(homeAppeal.requestedHomeScore).toBe(2);
    expect(awayAppeal.status).toBe("PENDING");

    await acceptScoreAppeal(prisma, {
      appealId: homeAppeal.id,
      resolutionNote: "Verified against the signed match sheet.",
      actor: fx.actor(fx.admin),
    });
    expect(await prisma.gameReport.findUnique({ where: { matchId: fx.match.id } })).toMatchObject({
      homeScore: 2,
      awayScore: 0,
      status: "CONFIRMED",
    });
  });

  it("rejects non-participants, wrong-team Captains, and non-Captains", async () => {
    const fx = await fixture();
    const nonCaptain = await createUser("non-captain");
    for (const [teamId, actor] of [
      [fx.home.id, fx.actor(nonCaptain)],
      [fx.home.id, fx.actor(fx.outsider)],
      [fx.other.id, fx.actor(fx.outsider)],
    ] as const) {
      await expect(appeal(fx, { teamId, actor })).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    }
  });

  it("validates required reasons, scores, and forfeit state", async () => {
    const fx = await fixture();
    await expect(appeal(fx, { reason: " " })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(appeal(fx, { requestedHomeScore: -1 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      appeal(fx, {
        requestedHomeScore: 1,
        requestedAwayScore: 1,
        requestedHomeForfeit: true,
        requestedAwayForfeit: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("enforces one pending appeal per team and report but permits a later appeal", async () => {
    const fx = await fixture();
    const first = await appeal(fx);
    await expect(appeal(fx)).rejects.toMatchObject({ code: "DUPLICATE_OPEN" });
    await rejectScoreAppeal(prisma, {
      appealId: first.id,
      resolutionNote: "The original report is supported by both officials.",
      actor: fx.actor(fx.admin),
    });
    const second = await appeal(fx, { reason: "New evidence supports the corrected score." });
    expect(second.id).not.toBe(first.id);
  });

  it("detects result/version races and leaves the appeal pending", async () => {
    const fx = await fixture();
    const submitted = await appeal(fx);
    await prisma.match.update({
      where: { id: fx.match.id },
      data: { version: { increment: 1 } },
    });
    await expect(
      acceptScoreAppeal(prisma, {
        appealId: submitted.id,
        resolutionNote: "This decision used the original version.",
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "RESULT_CHANGED" });
    expect(await prisma.scoreAppeal.findUnique({ where: { id: submitted.id } })).toMatchObject({
      status: "PENDING",
      openKey: `${fx.match.report!.id}:${fx.home.id}`,
    });
  });

  it("rejects with a mandatory note without mutating the report", async () => {
    const fx = await fixture();
    const submitted = await appeal(fx);
    await expect(
      rejectScoreAppeal(prisma, {
        appealId: submitted.id,
        resolutionNote: "",
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(
      rejectScoreAppeal(prisma, {
        appealId: submitted.id,
        resolutionNote: "A non-admin cannot decide this appeal.",
        actor: fx.actor(fx.homeCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await rejectScoreAppeal(prisma, {
      appealId: submitted.id,
      resolutionNote: "The referee confirmed the original score.",
      actor: fx.actor(fx.admin),
    });
    expect(await prisma.gameReport.findUnique({ where: { matchId: fx.match.id } })).toMatchObject({
      homeScore: 1,
      awayScore: 0,
    });
    expect(await prisma.scoreAppeal.findUnique({ where: { id: submitted.id } })).toMatchObject({
      status: "REJECTED",
      decisionNote: "The referee confirmed the original score.",
      decidedById: fx.admin.id,
      openKey: null,
    });
  });

  it("accepts once, updates standings, audits snapshots, and notifies both teams and referee", async () => {
    const fx = await fixture();
    const submitted = await appeal(fx, {
      requestedHomeScore: 0,
      requestedAwayScore: 2,
    });
    await acceptScoreAppeal(prisma, {
      appealId: submitted.id,
      resolutionNote: "Video and the signed sheet confirm the correction.",
      actor: fx.actor(fx.admin),
    });
    await expect(
      acceptScoreAppeal(prisma, {
        appealId: submitted.id,
        resolutionNote: "A second decision must not apply the result twice.",
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "ALREADY_DECIDED" });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.match.id } });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } });
    expect(match.version).toBe(8);
    const table = calculateStandings(
      [
        {
          id: fx.home.id,
          name: fx.home.name,
          shortName: fx.home.shortName,
          divisionId: fx.division.id,
        },
        {
          id: fx.away.id,
          name: fx.away.name,
          shortName: fx.away.shortName,
          divisionId: fx.division.id,
        },
      ],
      [
        {
          id: match.id,
          divisionId: match.divisionId,
          homeTeamId: match.homeTeamId,
          awayTeamId: match.awayTeamId,
          status: match.status,
          kickoffAt: match.kickoffAt,
          countsForStandings: match.countsForStandings,
          report: { ...report, discipline: [] },
        },
      ],
    );
    expect(table.find((row) => row.teamId === fx.away.id)?.points).toBe(3);
    expect(table.find((row) => row.teamId === fx.home.id)?.points).toBe(0);

    const audits = await prisma.auditLog.findMany({ orderBy: { createdAt: "asc" } });
    expect(audits.map(({ action }) => action)).toEqual([
      "score_appeal.submit",
      "report.override",
      "score_appeal.accept",
    ]);
    expect(audits[0].metadata).toContain('"original":{"homeScore":1');
    expect(audits[0].metadata).toContain('"requested":{"requestedHomeScore":0');

    const notifications = await prisma.notification.findMany({
      where: { type: "SCORE_APPEAL_ACCEPTED" },
    });
    expect(new Set(notifications.map(({ userId }) => userId))).toEqual(
      new Set([
        fx.homeCaptain.id,
        fx.awayCaptain.id,
        fx.homePlayer.id,
        fx.awayPlayer.id,
        fx.refereeUser.id,
      ]),
    );
  });
});
