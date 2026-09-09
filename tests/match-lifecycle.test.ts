import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  MatchError,
  adminAssignReferee,
  assignRefereeToMatch,
  confirmGameReport,
  disputeGameReport,
  forceUnlockMatch,
  lockMatch,
  overrideGameReport,
  submitGameReport,
  tallyGoalsFromEvents,
  unassignReferee,
  type ActorContext,
} from "@/lib/matches";
import { calculateStandings } from "@/lib/standings";

const prisma = new PrismaClient();

interface Fixture {
  matchId: string;
  homeTeamId: string;
  awayTeamId: string;
  homePlayerId: string;
  awayPlayerId: string;
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
  await prisma.gameEvent.deleteMany();
  await prisma.gameReport.deleteMany();
  await prisma.match.deleteMany();
  await prisma.player.deleteMany();
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
      players: {
        create: [
          { firstName: "Hana", lastName: "Ito", jerseyNumber: 9 },
          { firstName: "Hugo", lastName: "Diaz", jerseyNumber: 10 },
        ],
      },
    },
    include: { players: true },
  });

  const away = await prisma.team.create({
    data: {
      divisionId: division.id,
      name: "Away United",
      slug: "away-united",
      shortName: "AWY",
      players: {
        create: [
          { firstName: "Amara", lastName: "Cole", jerseyNumber: 7 },
          { firstName: "Andre", lastName: "Lopez", jerseyNumber: 11 },
        ],
      },
    },
    include: { players: true },
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
    homePlayerId: home.players[0].id,
    awayPlayerId: away.players[0].id,
    refereeA: refA.id,
    refereeB: refB.id,
    divisionId: division.id,
    seasonId: season.id,
  };
}

/** Drive a match all the way to LOCKED so report tests can start there. */
async function lockedMatch(fx: Fixture, refereeId = fx.refereeA) {
  const actor = actorFor(refereeId, "Riley Whistle");
  await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId, actor });
  await lockMatch(prisma, { matchId: fx.matchId, actor });
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

  it("blocks the referee once the match is locked", async () => {
    const actor = await lockedMatch(fx);

    await expect(unassignReferee(prisma, { matchId: fx.matchId, actor })).rejects.toMatchObject({
      status: 409,
      code: "MATCH_LOCKED",
    });
  });

  it("still allows an admin to reverse a locked match", async () => {
    await lockedMatch(fx);
    await unassignReferee(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "referee unavailable",
    });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.refereeId).toBeNull();
    expect(match.lockedAt).toBeNull();
    expect(
      await prisma.auditLog.count({ where: { action: "match.force_unassign" } }),
    ).toBe(1);
  });
});

describe("lockMatch", () => {
  it("locks a match owned by the caller", async () => {
    const actor = actorFor(fx.refereeA, "Riley Whistle");
    await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId: fx.refereeA, actor });
    const result = await lockMatch(prisma, { matchId: fx.matchId, actor });

    expect(result.version).toBe(2);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("LOCKED");
    expect(match.lockedAt).toBeInstanceOf(Date);
    expect(match.lockedById).toBe(fx.refereeA);
    expect(match.lockedByName).toBe("Riley Whistle");
  });

  it("refuses to lock an unassigned match", async () => {
    await expect(
      lockMatch(prisma, {
        matchId: fx.matchId,
        actor: actorFor(fx.refereeA, "Riley Whistle"),
      }),
    ).rejects.toMatchObject({ status: 409, code: "NOT_ASSIGNED" });
  });

  it("refuses to let a non-owner referee lock", async () => {
    await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor: actorFor(fx.refereeA, "Riley Whistle"),
    });

    await expect(
      lockMatch(prisma, { matchId: fx.matchId, actor: actorFor(fx.refereeB, "Sam Sideline") }),
    ).rejects.toMatchObject({ status: 403, code: "NOT_YOUR_MATCH" });
  });

  it("rejects a double lock", async () => {
    const actor = await lockedMatch(fx);
    await expect(lockMatch(prisma, { matchId: fx.matchId, actor })).rejects.toMatchObject({
      status: 409,
      code: "MATCH_LOCKED",
    });
  });

  it("only lets one of two concurrent lock attempts succeed", async () => {
    const actor = actorFor(fx.refereeA, "Riley Whistle");
    await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId: fx.refereeA, actor });

    const results = await Promise.allSettled([
      lockMatch(prisma, { matchId: fx.matchId, actor, expectedVersion: 1 }),
      lockMatch(prisma, { matchId: fx.matchId, actor, expectedVersion: 1 }),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.version).toBe(2);
  });

  it("lets an admin lock on the referee's behalf", async () => {
    await assignRefereeToMatch(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor: actorFor(fx.refereeA, "Riley Whistle"),
    });
    await lockMatch(prisma, { matchId: fx.matchId, actor: adminActor });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("LOCKED");
  });
});

describe("forceUnlockMatch", () => {
  it("is admin only", async () => {
    const actor = await lockedMatch(fx);
    await expect(
      forceUnlockMatch(prisma, { matchId: fx.matchId, actor, reason: "oops" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns a locked match to ASSIGNED and audits the reason", async () => {
    await lockedMatch(fx);
    await forceUnlockMatch(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "wrong kickoff time",
    });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("ASSIGNED");
    expect(match.lockedAt).toBeNull();

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "match.force_unlock" },
    });
    expect(audit.metadata).toContain("wrong kickoff time");
  });
});

describe("tallyGoalsFromEvents", () => {
  it("credits own goals to the opposing team", () => {
    const tally = tallyGoalsFromEvents(
      [
        { type: "GOAL", teamId: "home", minute: 10 },
        { type: "PENALTY_GOAL", teamId: "home", minute: 40 },
        { type: "OWN_GOAL", teamId: "home", minute: 55 },
        { type: "YELLOW", teamId: "away", minute: 60 },
      ],
      "home",
      "away",
    );
    expect(tally).toEqual({ home: 2, away: 1 });
  });
});

describe("submitGameReport", () => {
  it("requires the match to be locked", async () => {
    const actor = actorFor(fx.refereeA, "Riley Whistle");
    await assignRefereeToMatch(prisma, { matchId: fx.matchId, refereeId: fx.refereeA, actor });

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor,
        input: { homeScore: 0, awayScore: 0 },
      }),
    ).rejects.toMatchObject({ status: 409, code: "NOT_LOCKED" });
  });

  it("rejects a report from a referee who does not own the match", async () => {
    await lockedMatch(fx);

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeB,
        actor: actorFor(fx.refereeB, "Sam Sideline"),
        input: { homeScore: 0, awayScore: 0 },
      }),
    ).rejects.toMatchObject({ status: 403, code: "NOT_YOUR_MATCH" });
  });

  it("stores the report, its events, and moves the match to REPORT_SUBMITTED", async () => {
    const actor = await lockedMatch(fx);

    const { reportId } = await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 2,
        awayScore: 1,
        notes: "Clean game.",
        incidentReport: null,
        events: [
          { type: "GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 12 },
          { type: "PENALTY_GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 44 },
          { type: "GOAL", teamId: fx.awayTeamId, playerId: fx.awayPlayerId, minute: 70 },
          { type: "YELLOW", teamId: fx.awayTeamId, playerId: fx.awayPlayerId, minute: 75 },
        ],
      },
    });

    const report = await prisma.gameReport.findUniqueOrThrow({
      where: { id: reportId },
      include: { events: true },
    });
    expect(report.status).toBe("SUBMITTED");
    expect(report.homeScore).toBe(2);
    expect(report.events).toHaveLength(4);

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("REPORT_SUBMITTED");

    expect(await prisma.auditLog.count({ where: { action: "report.submit" } })).toBe(1);
  });

  it("rejects a score that contradicts the goal events", async () => {
    const actor = await lockedMatch(fx);

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor,
        input: {
          homeScore: 3,
          awayScore: 0,
          events: [{ type: "GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 12 }],
        },
      }),
    ).rejects.toMatchObject({ status: 400, code: "INVALID_STATE" });

    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.matchId } });
    expect(match.status).toBe("LOCKED");
  });

  it("rejects an event for a team that is not playing", async () => {
    const actor = await lockedMatch(fx);
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
          events: [{ type: "GOAL", teamId: other.id, minute: 10 }],
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a scorer who is not on that team's roster", async () => {
    const actor = await lockedMatch(fx);

    await expect(
      submitGameReport(prisma, {
        matchId: fx.matchId,
        refereeId: fx.refereeA,
        actor,
        input: {
          homeScore: 1,
          awayScore: 0,
          // Away player credited with a home goal.
          events: [
            { type: "GOAL", teamId: fx.homeTeamId, playerId: fx.awayPlayerId, minute: 10 },
          ],
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows a forfeit to skip the score/event consistency check", async () => {
    const actor = await lockedMatch(fx);
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
    const actor = await lockedMatch(fx);
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
    const actor = await lockedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 1,
        awayScore: 0,
        events: [{ type: "GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 30 }],
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

  it("disputes a report and sends the match back to LOCKED", async () => {
    await submitted();
    await disputeGameReport(prisma, {
      matchId: fx.matchId,
      actor: adminActor,
      reason: "score disputed by home captain",
    });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.matchId } });
    expect(report.status).toBe("DISPUTED");
    expect(report.disputeReason).toContain("home captain");
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

describe("end-to-end: report feeds the standings", () => {
  it("recomputes the table from a freshly submitted report", async () => {
    const actor = await lockedMatch(fx);
    await submitGameReport(prisma, {
      matchId: fx.matchId,
      refereeId: fx.refereeA,
      actor,
      input: {
        homeScore: 2,
        awayScore: 0,
        events: [
          { type: "GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 10 },
          { type: "GOAL", teamId: fx.homeTeamId, playerId: fx.homePlayerId, minute: 80 },
          { type: "YELLOW", teamId: fx.awayTeamId, playerId: fx.awayPlayerId, minute: 85 },
        ],
      },
    });

    const teams = await prisma.team.findMany({
      where: { divisionId: fx.divisionId },
      select: { id: true, name: true, divisionId: true },
    });
    const matches = await prisma.match.findMany({
      where: { divisionId: fx.divisionId },
      select: {
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
            events: { select: { type: true, teamId: true } },
          },
        },
      },
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
      select: {
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
            events: { select: { type: true, teamId: true } },
          },
        },
      },
    });
    const afterConfirm = calculateStandings(teams, confirmedMatches, {
      includeUnconfirmed: false,
    });
    expect(afterConfirm.find((r) => r.teamId === fx.homeTeamId)?.points).toBe(3);
  });
});
