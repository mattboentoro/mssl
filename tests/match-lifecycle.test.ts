import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  MatchError,
  adminAssignReferee,
  assignRefereeToMatch,
  addDisciplinaryAction,
  confirmGameReport,
  disputeGameReport,
  overrideGameReport,
  submitGameReport,
  unassignReferee,
  type ActorContext,
} from "@/lib/matches";
import { calculateStandings } from "@/lib/standings";
import { getWarningBoard } from "@/lib/queries";

const prisma = new PrismaClient();

interface Fixture {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  refereeA: string;
  refereeB: string;
  divisionId: string;
  seasonId: string;
}

const actorFor = (refereeId: string, name: string): ActorContext => ({
  id: `user-${refereeId}`,
  email: `${name.toLowerCase().replace(/\s+/g, ".")}@example.com`,
  name,
  role: "referee",
  refereeId,
  isAdmin: false,
});

const adminActor: ActorContext = {
  id: "user-admin",
  email: "alex.board@example.com",
  name: "Alex Board",
  role: "admin",
  refereeId: null,
  isAdmin: true,
};

async function resetDatabase() {
  // Order matters: children before parents.
  await prisma.auditLog.deleteMany();
  await prisma.disciplinaryAction.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.season.deleteMany();
  await prisma.venue.deleteMany();
  await prisma.referee.deleteMany();
}

async function createFixture(): Promise<Fixture> {
  const season = await prisma.season.create({
    data: {
      name: "Test Season",
      slug: "test-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-06-01"),
      isActive: true,
    },
  });

  const division = await prisma.division.create({
    data: { seasonId: season.id, name: "Division 1", slug: "division-1" },
  });

  const venue = await prisma.venue.create({
    data: { name: "Redmond Pitch", slug: "redmond-pitch" },
  });

  const home = await prisma.team.create({
    data: {
      divisionId: division.id,
      name: "Home FC",
      slug: "home-fc",
      shortName: "HOM",
    },
  });

  const away = await prisma.team.create({
    data: {
      divisionId: division.id,
      name: "Away United",
      slug: "away-united",
      shortName: "AWY",
    },
  });

  const [refA, refB] = await Promise.all([
    prisma.referee.create({ data: { name: "Riley Whistle", email: "riley@example.com" } }),
    prisma.referee.create({ data: { name: "Sam Sideline", email: "sam@example.com" } }),
  ]);

  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      divisionId: division.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      venueId: venue.id,
      kickoffAt: new Date("2026-02-01T18:00:00Z"),
      matchweek: 1,
      status: "SCHEDULED",
    },
  });

  return {
    matchId: match.id,
    homeTeamId: home.id,
    awayTeamId: away.id,
    refereeA: refA.id,
    refereeB: refB.id,
    divisionId: division.id,
    seasonId: season.id,
  };
}

/** Claim the match for a referee so report tests can start there. */
async function claimedMatch(fx: Fixture, refereeId = fx.refereeA) {
  const actor = actorFor(refereeId, "Riley Whistle");
  await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId, actor });
  return actor;
}

let fx: Fixture;

beforeEach(async () => {
  await resetDatabase();
  fx = await createFixture();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("assignRefereeToMatch", () => {
  it("assigns an open match and bumps the version", async () => {
    const result = await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor: actorFor(fx.refereeA, "Riley Whistle"),
    });

    expect(result).toMatchObject({ alreadyOwned: false, refereeId: fx.refereeA, version: 1 });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("ASSIGNED");
    expect(match.refereeId).toBe(fx.refereeA);
    expect(match.assignedAt).toBeInstanceOf(Date);
    expect(match.version).toBe(1);
  });

  it("writes an audit row", async () => {
    await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor: actorFor(fx.refereeA, "Riley Whistle"),
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "match.assign", entityId: fx.matchId },
    });
    expect(audit).not.toBeNull();
    expect(audit?.actorRole).toBe("referee");
  });

  it("lets exactly one of two concurrent referees win the race", async () => {
    const attempts = await Promise.allSettled([
      assignRefereeToMatch(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        expectedVersion: 0,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
      assignRefereeToMatch(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeB,
        expectedVersion: 0,
        actor: actorFor(fx.refereeB, "Sam Sideline"),
      }),
    ]);

    const winners = attempts.filter((a) => a.status === "fulfilled");
    const losers = attempts.filter((a) => a.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);

    const failure = (losers[0] as PromiseRejectedResult).reason as MatchError;
    expect(failure).toBeInstanceOf(MatchError);
    expect(failure.status).toBe(409);
    expect(failure.code).toBe("ALREADY_ASSIGNED");

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect([fx.refereeA, fx.refereeB]).toContain(match.refereeId);
    expect(match.version).toBe(1);

    // Exactly one assignment audit row — the loser must not have written one.
    const auditCount = await prisma.auditLog.count({ where: { action: "match.assign" } });
    expect(auditCount).toBe(1);
  });

  it("survives a five-way stampede with a single winner", async () => {
    const referees = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        prisma.referee.create({ data: { name: `Ref ${i}`, email: `ref${i}@example.com` } }),
      ),
    );

    const results = await Promise.allSettled(
      referees.map((ref) =>
        assignRefereeToMatch(prisma, {
          matchId: fx.matchId,
          refereeId: ref.id,
          expectedVersion: 0,
          actor: actorFor(ref.id, ref.name),
        }),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.version).toBe(1);
  });

  it("is idempotent for the referee who already owns the match", async () => {
    const actor = actorFor(fx.refereeA, "Riley Whistle");
    await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId: fx.refereeA, actor });

    const retry = await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
    });

    expect(retry.alreadyOwned).toBe(true);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.version).toBe(1);
  });

  it("rejects a stale expectedVersion with 409 VERSION_CONFLICT", async () => {
    await prisma.match.update({ where: { id: fx.matchId }, data: { version: 4 } });

    await expect(
      assignRefereeToMatch(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        expectedVersion: 0,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
    ).rejects.toMatchObject({ status: 409, code: "VERSION_CONFLICT" });
  });

  it("refuses to assign a cancelled match", async () => {
    await prisma.match.update({ where: { id: fx.matchId }, data: { status: "CANCELLED" } });

    await expect(
      assignRefereeToMatch(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
    ).rejects.toMatchObject({ status: 409, code: "MATCH_CLOSED" });
  });

  it("404s for an unknown match", async () => {
    await expect(
      assignRefereeToMatch(prisma, {
        matchId: "does-not-exist",
        refereeId: fx.refereeA,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
    ).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
  });
});

describe("unassignReferee", () => {
  it("lets the assigned referee drop the match before lock", async () => {
    const actor = actorFor(fx.refereeA, "Riley Whistle");
    await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId: fx.refereeA, actor });
    await unassignReferee(prisma, { matchId: fx.matchId, actor });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.refereeId).toBeNull();
    expect(match.status).toBe("SCHEDULED");
  });

  it("blocks a different referee from dropping someone else's match", async () => {
    await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor: actorFor(fx.refereeA, "Riley Whistle"),
    });

    await expect(
      unassignReferee(prisma, {
        matchId: fx.matchId,
        actor: actorFor(fx.refereeB, "Sam Sideline"),
      }),
    ).rejects.toMatchObject({ status: 403, code: "NOT_YOUR_MATCH" });
  });

  it("blocks the referee once a report has been filed", async () => {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: { homeScore: 1, awayScore: 0 },
    });

    await expect(unassignReferee(prisma, { matchId: fx.matchId, actor })).rejects.toMatchObject({
      status: 409,
      code: "INVALID_STATE",
    });
  });

  it("still allows an admin to reverse a claimed match", async () => {
    await claimedMatch(fx);
    await unassignReferee(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "referee unavailable",
    });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.refereeId).toBeNull();
    expect(match.status).toBe("SCHEDULED");
    expect(await prisma.auditLog.count({ where: { action: "match.force_unassign" } })).toBe(1);
  });
});

describe("submitGameReport", () => {
  it("requires the match to be claimed first", async () => {
    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
        input: { homeScore: 0, awayScore: 0 },
      }),
    ).rejects.toMatchObject({ status: 409, code: "NOT_ASSIGNED" });
  });

  it("rejects a report from a referee who does not own the match", async () => {
    await claimedMatch(fx);

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeB,
        actor: actorFor(fx.refereeB, "Sam Sideline"),
        input: { homeScore: 0, awayScore: 0 },
      }),
    ).rejects.toMatchObject({ status: 403, code: "NOT_YOUR_MATCH" });
  });

  it("stores the report, its cards, and moves the match to REPORT_SUBMITTED", async () => {
    const actor = await claimedMatch(fx);

    const { reportId } = await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 2,
        awayScore: 1,
        notes: "Clean game.",
        incidentReport: null,
        cards: [
          { type: "YELLOW", teamId: fx.awayTeamId, playerName: "Andre Lopez", minute: 75 },
          { type: "RED", teamId: fx.homeTeamId, playerName: "Hana Ito", minute: 88 },
        ],
      },
    });

    const report = await prisma.gameReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { discipline: true },
    });
    expect(report.status).toBe("SUBMITTED");
    expect(report.homeScore).toBe(2);
    expect(report.discipline).toHaveLength(2);
    expect(report.discipline.every((c) => c.issuedBy === "REFEREE")).toBe(true);
    expect(report.discipline.map((c) => c.playerName)).toContain("Andre Lopez");

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("REPORT_SUBMITTED");

    expect(await prisma.auditLog.count({ where: { action: "report.submit" } })).toBe(1);
  });

  it("rejects a card for a team that is not playing", async () => {
    const actor = await claimedMatch(fx);
    const other = await prisma.team.create({
      data: {
        divisionId: fx.divisionId,
        name: "Third Wheel",
        slug: "third-wheel",
        shortName: "TWL",
      },
    });

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor,
        input: {
          homeScore: 1,
          awayScore: 0,
          cards: [{ type: "YELLOW", teamId: other.id, playerName: "Nobody Here", minute: 10 }],
        },
      }),
    ).rejects.toMatchObject({ status: 400 });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("ASSIGNED");
  });

  it("accepts a score with no cards at all", async () => {
    const actor = await claimedMatch(fx);
    const { reportId } = await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: { homeScore: 4, awayScore: 2 },
    });

    const report = await prisma.gameReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { discipline: true },
    });
    expect(report.discipline).toHaveLength(0);
    expect(report.awayScore).toBe(2);
  });

  it("records a forfeit and marks the match FORFEIT", async () => {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: { homeScore: 0, awayScore: 3, awayForfeit: false, homeForfeit: true },
    });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("FORFEIT");
  });

  it("refuses a second report for the same match", async () => {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: { homeScore: 0, awayScore: 0 },
    });

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor,
        input: { homeScore: 1, awayScore: 0 },
      }),
    ).rejects.toMatchObject({ status: 409, code: "REPORT_EXISTS" });
  });
});

describe("admin review", () => {
  async function submitted() {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 1,
        awayScore: 0,
        cards: [{ type: "YELLOW", teamId: fx.homeTeamId, playerName: "Hugo Diaz", minute: 30 }],
      },
    });
  }

  it("confirms a report", async () => {
    await submitted();
    await confirmGameReport(prisma, { matchId: fx.matchId, actor: adminActor });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.matchId } });
    expect(report.status).toBe("CONFIRMED");
    expect(report.confirmedAt).toBeInstanceOf(Date);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("CONFIRMED");
  });

  it("refuses confirmation from a non-admin", async () => {
    await submitted();
    await expect(
      confirmGameReport(prisma, {
        matchId: fx.matchId,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("disputes a report and sends the match back to the referee", async () => {
    await submitted();
    await disputeGameReport(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "score disputed by home captain",
    });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.matchId } });
    expect(report.status).toBe("DISPUTED");
    expect(report.disputeReason).toContain("home captain");

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("ASSIGNED");
  });

  it("overrides a result with a mandatory audited reason", async () => {
    await submitted();
    await overrideGameReport(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "ineligible player fielded",
      homeScore: 0,
      awayScore: 3,
    });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.matchId } });
    expect(report).toMatchObject({ homeScore: 0, awayScore: 3, status: "CONFIRMED" });
    expect(report.overrideReason).toContain("ineligible");

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "report.override" } });
    expect(audit.metadata).toContain("ineligible player fielded");
  });

  it("lets an admin force-assign and force-unassign a referee", async () => {
    await adminAssignReferee(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeB,
      actor: adminActor,
    });
    let match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.refereeId).toBe(fx.refereeB);
    expect(match.status).toBe("ASSIGNED");

    await adminAssignReferee(prisma, {
      matchId: fx.matchId,
      refereeId: null,
      actor: adminActor,
      reason: "reassigning",
    });
    match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.refereeId).toBeNull();
    expect(match.status).toBe("SCHEDULED");
  });
});

describe("addDisciplinaryAction", () => {
  it("lets an admin record a league sanction outside any fixture", async () => {
    const { id } = await addDisciplinaryAction(prisma, {
      actor: adminActor,
      input: {
        seasonId: fx.seasonId,
        teamId: fx.homeTeamId,
        playerName: "Hugo Diaz",
        type: "RED",
        note: "Retrospective ban after video review",
      },
    });

    const record = await prisma.disciplinaryAction.findUniqueOrThrow({ where: { id } });
    expect(record).toMatchObject({ issuedBy: "ADMIN", type: "RED", matchId: null });
    expect(await prisma.auditLog.count({ where: { action: "discipline.create" } })).toBe(1);
  });

  it("refuses a non-admin", async () => {
    await expect(
      addDisciplinaryAction(prisma, {
        actor: actorFor(fx.refereeA, "Riley Whistle"),
        input: {
          seasonId: fx.seasonId,
          teamId: fx.homeTeamId,
          playerName: "Hugo Diaz",
          type: "YELLOW",
        },
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("refuses a team that does not play in that season", async () => {
    const otherSeason = await prisma.season.create({
      data: {
        name: "Other Season",
        slug: "other-season",
        startsOn: new Date("2027-01-01"),
        endsOn: new Date("2027-06-01"),
      },
    });

    await expect(
      addDisciplinaryAction(prisma, {
        actor: adminActor,
        input: {
          seasonId: otherSeason.id,
          teamId: fx.homeTeamId,
          playerName: "Hugo Diaz",
          type: "YELLOW",
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_STATE" });
  });
});

describe("warning board", () => {
  it("groups a player's cards, folds name casing, and floats league sanctions to the top", async () => {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 0,
        awayScore: 0,
        cards: [
          { type: "YELLOW", teamId: fx.homeTeamId, playerName: "Hugo Diaz", minute: 20 },
          // Same player, sloppier typing — must fold into one row.
          { type: "YELLOW", teamId: fx.homeTeamId, playerName: "  hugo diaz ", minute: 71 },
          { type: "YELLOW", teamId: fx.awayTeamId, playerName: "Amara Cole", minute: 55 },
        ],
      },
    });

    await addDisciplinaryAction(prisma, {
      actor: adminActor,
      input: {
        seasonId: fx.seasonId,
        teamId: fx.awayTeamId,
        playerName: "Amara Cole",
        type: "RED",
        note: "Two-match suspension",
      },
    });

    const board = await getWarningBoard(prisma, fx.seasonId, [fx.homeTeamId, fx.awayTeamId]);

    // The sanctioned player leads even though Hugo has the same points total.
    expect(board[0]).toMatchObject({
      playerName: "Amara Cole",
      yellow: 1,
      red: 1,
      points: 4,
    });
    expect(board[0].sanctions).toHaveLength(1);
    expect(board[0].sanctions[0].note).toBe("Two-match suspension");

    expect(board[1]).toMatchObject({ playerName: "Hugo Diaz", yellow: 2, red: 0, points: 2 });
    expect(board[1].sanctions).toHaveLength(0);
    expect(board).toHaveLength(2);
  });

  it("is empty when neither side is carrying a card", async () => {
    expect(await getWarningBoard(prisma, fx.seasonId, [fx.homeTeamId, fx.awayTeamId])).toEqual([]);
  });

  it("ignores cards belonging to teams outside the fixture", async () => {
    await addDisciplinaryAction(prisma, {
      actor: adminActor,
      input: {
        seasonId: fx.seasonId,
        teamId: fx.homeTeamId,
        playerName: "Hugo Diaz",
        type: "RED",
      },
    });

    expect(await getWarningBoard(prisma, fx.seasonId, [fx.awayTeamId])).toEqual([]);
  });
});

describe("end-to-end: report feeds the standings", () => {
  it("recomputes the table from a freshly submitted report", async () => {
    const actor = await claimedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 2,
        awayScore: 0,
        cards: [{ type: "YELLOW", teamId: fx.awayTeamId, playerName: "Amara Cole", minute: 85 }],
      },
    });

    const teams = await prisma.team.findMany({
      where: { divisionId: fx.divisionId },
      select: { id: true, name: true, divisionId: true },
    });
    const selectMatches = {
      id: true,
      divisionId: true,
      homeTeamId: true,
      awayTeamId: true,
      status: true,
      kickoffAt: true,
      report: {
        select: {
          status: true,
          homeScore: true,
          awayScore: true,
          homeForfeit: true,
          awayForfeit: true,
          discipline: { select: { type: true, teamId: true } },
        },
      },
    } as const;

    const matches = await prisma.match.findMany({
      where: { divisionId: fx.divisionId },
      select: selectMatches,
    });

    const table = calculateStandings(teams, matches, { includeUnconfirmed: true });
    const home = table.find((r) => r.teamId === fx.homeTeamId);
    const away = table.find((r) => r.teamId === fx.awayTeamId);

    expect(home).toMatchObject({ rank: 1, played: 1, won: 1, goalsFor: 2, points: 3 });
    expect(away).toMatchObject({ played: 1, lost: 1, points: 0, yellowCards: 1 });

    // ...and it disappears again when unconfirmed reports are excluded.
    const strict = calculateStandings(teams, matches, { includeUnconfirmed: false });
    expect(strict.every((row) => row.played === 0)).toBe(true);

    await confirmGameReport(prisma, { matchId: fx.matchId, actor: adminActor });
    const confirmedMatches = await prisma.match.findMany({
      where: { divisionId: fx.divisionId },
      select: selectMatches,
    });
    const afterConfirm = calculateStandings(teams, confirmedMatches, {
      includeUnconfirmed: false,
    });
    expect(afterConfirm.find((r) => r.teamId === fx.homeTeamId)?.points).toBe(3);
  });
});
