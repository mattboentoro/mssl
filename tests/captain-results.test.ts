import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  respondToCaptainResult,
  reviewCaptainResult,
  submitCaptainResult,
} from "@/lib/captain-results";
import { overrideGameReport } from "@/lib/matches";
import { calculateStandings } from "@/lib/standings";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.captainResultProposal.deleteMany();
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

async function user(key: string) {
  return prisma.appUser.create({
    data: {
      entraObjectId: `captain-result-${key}`,
      email: `${key}@example.com`,
      normalizedEmail: `${key}@example.com`,
      displayName: key,
      status: "ACTIVE",
    },
  });
}

async function fixture(kickoffAt = new Date("2026-01-01T18:00:00Z")) {
  const season = await prisma.season.create({
    data: {
      name: "Captain Results",
      slug: `captain-results-${Date.now()}`,
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
  });
  const division = await prisma.division.create({
    data: { name: "Captain Results", slug: `captain-results-${Date.now()}` },
  });
  const [home, away, other] = await Promise.all(
    ["Home", "Away", "Other"].map((name) =>
      prisma.team.create({
        data: {
          divisionId: division.id,
          name,
          slug: `captain-results-${name.toLowerCase()}-${Date.now()}`,
          shortName: name,
        },
      }),
    ),
  );
  const [homeCaptain, awayCaptain, outsider, admin] = await Promise.all([
    user("home"),
    user("away"),
    user("outsider"),
    user("admin"),
  ]);
  await prisma.teamCaptain.createMany({
    data: [
      {
        seasonId: season.id,
        teamId: home.id,
        userId: homeCaptain.id,
        name: "Home captain",
        status: "ACTIVE",
      },
      {
        seasonId: season.id,
        teamId: away.id,
        userId: awayCaptain.id,
        name: "Away captain",
        status: "ACTIVE",
      },
      {
        seasonId: season.id,
        teamId: other.id,
        userId: outsider.id,
        name: "Other captain",
        status: "ACTIVE",
      },
    ],
  });
  await prisma.globalRoleAssignment.create({
    data: { userId: admin.id, role: "ADMIN" },
  });
  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      divisionId: division.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt,
      matchweek: "1",
    },
  });
  const actor = (record: typeof homeCaptain) => ({
    appUserId: record.id,
    email: record.email,
    name: record.displayName,
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
    match,
    actor,
  };
}

async function proposed(
  fx: Awaited<ReturnType<typeof fixture>>,
  result: {
    homeScore: number;
    awayScore: number;
    homeForfeit?: boolean;
    awayForfeit?: boolean;
    notes?: string;
  } = { homeScore: 2, awayScore: 1 },
) {
  return submitCaptainResult(prisma, {
    matchId: fx.match.id,
    teamId: fx.home.id,
    actor: fx.actor(fx.homeCaptain),
    result,
    now: new Date("2026-02-01"),
  });
}

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("Captain result proposals", () => {
  it("enforces participant Captain authorization and kickoff", async () => {
    const future = await fixture(new Date("2027-01-01"));
    await expect(
      submitCaptainResult(prisma, {
        matchId: future.match.id,
        teamId: future.home.id,
        actor: future.actor(future.homeCaptain),
        result: { homeScore: 1, awayScore: 0 },
        now: new Date("2026-01-01"),
      }),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    await expect(
      submitCaptainResult(prisma, {
        matchId: future.match.id,
        teamId: future.home.id,
        actor: future.actor(future.outsider),
        result: { homeScore: 1, awayScore: 0 },
        now: new Date("2028-01-01"),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates scores and forfeits, then rejects duplicate open submissions", async () => {
    const fx = await fixture();
    await expect(proposed(fx, { homeScore: -1, awayScore: 0 })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    const proposal = await proposed(fx, {
      homeScore: 3,
      awayScore: 0,
      awayForfeit: true,
      notes: "Away did not appear",
    });
    expect(proposal).toMatchObject({ awayForfeit: true, notes: "Away did not appear" });
    await expect(proposed(fx)).rejects.toMatchObject({ code: "DUPLICATE" });
    expect(await prisma.notification.count({ where: { userId: fx.awayCaptain.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "captain_result.submit" } })).toBe(1);
  });

  it("allows only an opposing Captain to approve or reject", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx);
    await expect(
      respondToCaptainResult(prisma, {
        proposalId: proposal.id,
        teamId: fx.home.id,
        approve: true,
        actor: fx.actor(fx.homeCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      respondToCaptainResult(prisma, {
        proposalId: proposal.id,
        teamId: fx.other.id,
        approve: true,
        actor: fx.actor(fx.outsider),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    expect(
      await prisma.captainResultProposal.findUnique({ where: { id: proposal.id } }),
    ).toMatchObject({
      status: "PENDING_ADMIN",
      confirmedById: fx.awayCaptain.id,
    });
    expect(await prisma.notification.count({ where: { userId: fx.admin.id } })).toBe(1);
  });

  it("closes an opponent rejection and permits a corrected resubmission", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx);
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: false,
      note: "Score was 1-1",
      actor: fx.actor(fx.awayCaptain),
    });
    expect(
      await prisma.captainResultProposal.findUnique({ where: { id: proposal.id } }),
    ).toMatchObject({
      status: "REJECTED_OPPONENT",
      reviewNote: "Score was 1-1",
    });
    const corrected = await proposed(fx, { homeScore: 1, awayScore: 1 });
    expect(corrected).toMatchObject({ id: proposal.id, status: "PENDING_OPPONENT", homeScore: 1 });
  });

  it("requires an Admin and finalizes through the official report used by standings", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx, { homeScore: 3, awayScore: 0, awayForfeit: true });
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await expect(
      reviewCaptainResult(prisma, {
        proposalId: proposal.id,
        approve: true,
        actor: fx.actor(fx.outsider),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await reviewCaptainResult(prisma, {
      proposalId: proposal.id,
      approve: true,
      note: "Both captains agreed",
      actor: fx.actor(fx.admin),
    });

    const report = await prisma.gameReport.findUniqueOrThrow({ where: { matchId: fx.match.id } });
    expect(report).toMatchObject({
      homeScore: 3,
      awayScore: 0,
      awayForfeit: true,
      status: "CONFIRMED",
      refereeId: null,
    });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } })).toMatchObject({
      status: "CONFIRMED",
      version: 1,
    });
    expect(
      await prisma.captainResultProposal.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).toMatchObject({
      status: "APPROVED",
    });
    const table = calculateStandings(
      [fx.home, fx.away],
      [{ ...fx.match, status: "CONFIRMED", report }],
    );
    expect(table.find(({ teamId }) => teamId === fx.home.id)).toMatchObject({
      played: 1,
      won: 1,
      points: 3,
    });
    expect(await prisma.auditLog.count({ where: { action: "captain_result.approve" } })).toBe(1);
    expect(await prisma.notification.count({ where: { type: "CAPTAIN_RESULT_APPROVED" } })).toBe(2);
  });

  it("keeps an ineligible proposal rejectable after approval fails", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx);
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    const referee = await prisma.referee.create({
      data: { name: "Race", email: "race@example.com" },
    });
    await prisma.match.update({
      where: { id: fx.match.id },
      data: { refereeId: referee.id, status: "ASSIGNED", version: { increment: 1 } },
    });
    await expect(
      reviewCaptainResult(prisma, {
        proposalId: proposal.id,
        approve: true,
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
    expect(await prisma.gameReport.findUnique({ where: { matchId: fx.match.id } })).toBeNull();

    await reviewCaptainResult(prisma, {
      proposalId: proposal.id,
      approve: false,
      note: "A referee is now responsible for the official report.",
      actor: fx.actor(fx.admin),
    });
    expect(
      await prisma.captainResultProposal.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).toMatchObject({
      status: "REJECTED_ADMIN",
      reviewNote: "A referee is now responsible for the official report.",
    });
    expect(
      await prisma.auditLog.count({
        where: { action: "captain_result.reject_admin", entityId: proposal.id },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { type: "CAPTAIN_RESULT_REJECTED", href: `/captain/results/${fx.match.id}` },
      }),
    ).toBe(2);
  });

  it("invalidates open proposals when an Admin enters an official result", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx);
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await overrideGameReport(prisma, {
      matchId: fx.match.id,
      actor: { ...fx.actor(fx.admin), id: fx.admin.id, isAdmin: true },
      reason: "League received the official score sheet",
      homeScore: 1,
      awayScore: 0,
    });
    expect(
      await prisma.captainResultProposal.findUniqueOrThrow({ where: { id: proposal.id } }),
    ).toMatchObject({ status: "REJECTED_ADMIN" });
    await expect(
      reviewCaptainResult(prisma, {
        proposalId: proposal.id,
        approve: true,
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("rejects a proposal when the fixture version changes after submission", async () => {
    const fx = await fixture();
    const proposal = await proposed(fx);
    await respondToCaptainResult(prisma, {
      proposalId: proposal.id,
      teamId: fx.away.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await prisma.match.update({
      where: { id: fx.match.id },
      data: {
        notes: "Fixture changed after Captain agreement",
        version: { increment: 1 },
        updatedAt: new Date(proposal.createdAt.getTime() + 1000),
      },
    });
    await expect(
      reviewCaptainResult(prisma, {
        proposalId: proposal.id,
        approve: true,
        actor: fx.actor(fx.admin),
      }),
    ).rejects.toMatchObject({ code: "NOT_ELIGIBLE" });
  });
});
