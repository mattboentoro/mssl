import fs from "node:fs";
import path from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  cancelReschedule,
  proposeReschedule,
  respondToReschedule,
  reviewRescheduleAsAdmin,
  reviseReschedule,
} from "@/lib/reschedules";

const prisma = new PrismaClient();
const NOW = new Date("2026-09-01T12:00:00Z");
const ORIGINAL_KICKOFF = new Date("2026-10-10T18:00:00Z");
const PROPOSED_KICKOFF = new Date("2026-10-17T19:00:00Z");

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.rescheduleSlot.deleteMany();
  await prisma.auditLog.deleteMany();
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
      entraObjectId: `reschedule-${key}`,
      email: `${key}@example.com`,
      normalizedEmail: `${key}@example.com`,
      displayName: key,
      status: "ACTIVE",
    },
  });
}

async function fixture(options: { assigned?: boolean } = {}) {
  const season = await prisma.season.create({
    data: {
      name: "Reschedule Season",
      slug: "reschedule-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
    },
  });
  const division = await prisma.division.create({
    data: { name: "Reschedule Division", slug: "reschedule-division" },
  });
  const [home, away, other] = await Promise.all(
    ["Home", "Away", "Other"].map((name) =>
      prisma.team.create({
        data: {
          divisionId: division.id,
          name,
          slug: `reschedule-${name.toLowerCase()}`,
          shortName: name.toUpperCase(),
        },
      }),
    ),
  );
  const [homeCaptain, awayCaptain, otherCaptain, admin, refereeUser] = await Promise.all([
    createUser("home-captain"),
    createUser("away-captain"),
    createUser("other-captain"),
    createUser("admin"),
    createUser("referee"),
  ]);
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
        userId: otherCaptain.id,
        name: otherCaptain.displayName,
        status: "ACTIVE",
      },
    ],
  });
  await prisma.globalRoleAssignment.create({
    data: { userId: admin.id, role: "ADMIN" },
  });
  const referee = options.assigned
    ? await prisma.referee.create({
        data: {
          name: "Assigned Referee",
          email: refereeUser.email,
          userId: refereeUser.id,
          entraObjectId: refereeUser.entraObjectId,
        },
      })
    : null;
  const assignedAt = options.assigned ? new Date("2026-08-15T12:00:00Z") : null;
  const match = await prisma.match.create({
    data: {
      seasonId: season.id,
      divisionId: division.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      kickoffAt: ORIGINAL_KICKOFF,
      venueName: "Original Field",
      matchweek: "5",
      status: options.assigned ? "ASSIGNED" : "SCHEDULED",
      refereeId: referee?.id,
      assignedAt,
      version: 7,
    },
  });
  const actor = (user: typeof homeCaptain, isAdmin = false) => ({
    appUserId: user.id,
    email: user.email,
    name: user.displayName,
    isAdmin,
  });
  return {
    season,
    home,
    away,
    other,
    homeCaptain,
    awayCaptain,
    otherCaptain,
    admin,
    refereeUser,
    referee,
    assignedAt,
    match,
    actor,
  };
}

async function proposed(fx: Awaited<ReturnType<typeof fixture>>) {
  const selectedSlot = await slot();
  return proposeReschedule(prisma, {
    matchId: fx.match.id,
    requestingTeamId: fx.home.id,
    slotId: selectedSlot.id,
    reason: "The team has a mandatory company event.",
    actor: fx.actor(fx.homeCaptain),
    now: NOW,
  });
}

async function slot(kickoffAt = PROPOSED_KICKOFF, venueName = "New Field") {
  return (
    (await prisma.rescheduleSlot.findFirst({ where: { kickoffAt, venueName } })) ??
    prisma.rescheduleSlot.create({ data: { kickoffAt, venueName } })
  );
}

function clientWithTransitionRace(): PrismaClient {
  let raced = false;
  return {
    $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      return prisma.$transaction(async (tx) => {
        const requestDelegate = new Proxy(tx.rescheduleRequest, {
          get(target, property, receiver) {
            if (property !== "updateMany") return Reflect.get(target, property, receiver);
            return async (args: Prisma.RescheduleRequestUpdateManyArgs) => {
              if (!raced) {
                raced = true;
                await tx.rescheduleRequest.update({
                  where: { id: String(args.where?.id) },
                  data: { status: "CANCELLED", openMatchKey: null },
                });
              }
              return target.updateMany(args);
            };
          },
        });
        const racedTx = new Proxy(tx, {
          get(target, property, receiver) {
            if (property === "rescheduleRequest") return requestDelegate;
            return Reflect.get(target, property, receiver);
          },
        });
        return operation(racedTx);
      });
    },
  } as unknown as PrismaClient;
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("Captain reschedule requests", () => {
  it("creates a complete snapshot, audits it, notifies the opponent, and leaves the fixture unchanged", async () => {
    const fx = await fixture();
    const request = await proposed(fx);

    expect(request).toMatchObject({
      status: "PENDING_OPPONENT",
      requestingTeamId: fx.home.id,
      requestedById: fx.homeCaptain.id,
      originalKickoffAt: ORIGINAL_KICKOFF,
      originalVenueName: "Original Field",
      expectedMatchVersion: 7,
      openMatchKey: fx.match.id,
      activeSlotKey: request.slotId,
      legacySlotExempt: false,
      proposedKickoffAt: PROPOSED_KICKOFF,
      proposedVenueName: "New Field",
    });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: ORIGINAL_KICKOFF,
      venueName: "Original Field",
      version: 7,
    });
    await expect(
      prisma.notification.findFirstOrThrow({ where: { userId: fx.awayCaptain.id } }),
    ).resolves.toMatchObject({ type: "RESCHEDULE_PROPOSED" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: request.id } });
    expect(audit.action).toBe("reschedule.propose");
    expect(audit.metadata).toContain('"expectedMatchVersion":7');
  });

  it("rejects outsiders, non-participants, past/final fixtures, missing rationale, and duplicate open requests", async () => {
    const fx = await fixture();
    const selectedSlot = await slot();
    await expect(
      proposeReschedule(prisma, {
        matchId: fx.match.id,
        requestingTeamId: fx.home.id,
        slotId: selectedSlot.id,
        reason: "No authority",
        actor: fx.actor(fx.otherCaptain),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      proposeReschedule(prisma, {
        matchId: fx.match.id,
        requestingTeamId: fx.other.id,
        slotId: selectedSlot.id,
        reason: "Not participating",
        actor: fx.actor(fx.otherCaptain),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      proposeReschedule(prisma, {
        matchId: fx.match.id,
        requestingTeamId: fx.home.id,
        slotId: selectedSlot.id,
        reason: " ",
        actor: fx.actor(fx.homeCaptain),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });

    await proposed(fx);
    await expect(proposed(fx)).rejects.toMatchObject({ code: "DUPLICATE_OPEN_REQUEST" });
    await prisma.rescheduleRequest.deleteMany();
    await prisma.match.update({
      where: { id: fx.match.id },
      data: { status: "CONFIRMED" },
    });
    await expect(proposed(fx)).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("allows only the proposer to revise or cancel while awaiting the opponent", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    const revisedKickoff = new Date("2026-10-24T20:00:00Z");
    const revisedSlot = await slot(revisedKickoff, "Revised Field");

    await expect(
      reviseReschedule(prisma, {
        requestId: request.id,
        slotId: revisedSlot.id,
        reason: "A revised rationale.",
        actor: fx.actor(fx.awayCaptain),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const revised = await reviseReschedule(prisma, {
      requestId: request.id,
      slotId: revisedSlot.id,
      reason: "A revised rationale.",
      actor: fx.actor(fx.homeCaptain),
      now: NOW,
    });
    expect(revised).toMatchObject({
      proposedKickoffAt: revisedKickoff,
      proposedVenueName: "Revised Field",
      originalKickoffAt: ORIGINAL_KICKOFF,
      expectedMatchVersion: 7,
    });
    const cancelled = await cancelReschedule(prisma, {
      requestId: request.id,
      actor: fx.actor(fx.homeCaptain),
    });
    expect(cancelled).toMatchObject({ status: "CANCELLED", openMatchKey: null });
    await expect(
      prisma.rescheduleSlot.findUniqueOrThrow({ where: { id: revisedSlot.id } }),
    ).resolves.toMatchObject({ status: "AVAILABLE" });
    await expect(
      reviseReschedule(prisma, {
        requestId: request.id,
        slotId: revisedSlot.id,
        reason: "Too late.",
        actor: fx.actor(fx.homeCaptain),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("permits only an opposing Captain to approve or reject and never changes the fixture", async () => {
    const fx = await fixture();
    const request = await proposed(fx);

    await expect(
      respondToReschedule(prisma, {
        requestId: request.id,
        approve: true,
        actor: fx.actor(fx.homeCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      respondToReschedule(prisma, {
        requestId: request.id,
        approve: true,
        actor: fx.actor(fx.otherCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const approved = await respondToReschedule(prisma, {
      requestId: request.id,
      approve: true,
      responseNote: "Works for us.",
      actor: fx.actor(fx.awayCaptain),
    });
    expect(approved).toMatchObject({
      status: "PENDING_ADMIN",
      openMatchKey: fx.match.id,
      respondedById: fx.awayCaptain.id,
      responseNote: "Works for us.",
    });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: ORIGINAL_KICKOFF,
      venueName: "Original Field",
      version: 7,
    });
    await expect(
      prisma.notification.findFirstOrThrow({
        where: { userId: fx.admin.id, type: "RESCHEDULE_AWAITING_ADMIN" },
      }),
    ).resolves.toBeTruthy();
  });

  it("records an opponent rejection and closes the request", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    const rejected = await respondToReschedule(prisma, {
      requestId: request.id,
      approve: false,
      responseNote: "We cannot field a team then.",
      actor: fx.actor(fx.awayCaptain),
    });
    expect(rejected).toMatchObject({ status: "REJECTED_OPPONENT", openMatchKey: null });
    await expect(
      respondToReschedule(prisma, {
        requestId: request.id,
        approve: true,
        actor: fx.actor(fx.awayCaptain),
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      prisma.notification.findFirstOrThrow({
        where: { userId: fx.homeCaptain.id, type: "RESCHEDULE_REJECTED" },
      }),
    ).resolves.toBeTruthy();
  });

  it("admin approval changes only kickoff and venue, increments version, and preserves assignment semantics", async () => {
    const fx = await fixture({ assigned: true });
    const player = await createUser("home-player");
    await prisma.teamMembership.create({
      data: {
        seasonId: fx.season.id,
        teamId: fx.home.id,
        userId: player.id,
        status: "ACTIVE",
      },
    });
    const request = await proposed(fx);
    await respondToReschedule(prisma, {
      requestId: request.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });

    const reviewed = await reviewRescheduleAsAdmin(prisma, {
      requestId: request.id,
      approve: true,
      reviewNote: "Facilities confirmed.",
      actor: fx.actor(fx.admin, true),
      now: NOW,
    });
    expect(reviewed).toMatchObject({
      status: "APPROVED",
      openMatchKey: null,
      adminReviewedById: fx.admin.id,
      adminReviewNote: "Facilities confirmed.",
    });
    await expect(
      prisma.rescheduleSlot.findUniqueOrThrow({ where: { id: request.slotId! } }),
    ).resolves.toMatchObject({ status: "USED" });
    const match = await prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } });
    expect(match).toMatchObject({
      kickoffAt: PROPOSED_KICKOFF,
      venueName: "New Field",
      version: 8,
      status: "ASSIGNED",
      refereeId: fx.referee?.id,
      assignedAt: fx.assignedAt,
      homeTeamId: fx.home.id,
      awayTeamId: fx.away.id,
      matchweek: "5",
    });
    const recipientIds = (
      await prisma.notification.findMany({
        where: { type: "RESCHEDULE_APPROVED" },
        select: { userId: true },
      })
    ).map(({ userId }) => userId);
    expect(recipientIds).toEqual(
      expect.arrayContaining([fx.homeCaptain.id, fx.awayCaptain.id, player.id, fx.refereeUser.id]),
    );
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { action: "reschedule.admin_approve" } }),
    ).resolves.toMatchObject({ actorRole: "admin", entityId: request.id });
  });

  it("uses the selected slot venue rather than accepting a free-form venue", async () => {
    const fx = await fixture();
    const selectedSlot = await slot(PROPOSED_KICKOFF, "League Reserved Field");
    const request = await proposeReschedule(prisma, {
      matchId: fx.match.id,
      requestingTeamId: fx.home.id,
      slotId: selectedSlot.id,
      reason: "Only the kickoff needs to change.",
      actor: fx.actor(fx.homeCaptain),
      now: NOW,
    });
    await respondToReschedule(prisma, {
      requestId: request.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await reviewRescheduleAsAdmin(prisma, {
      requestId: request.id,
      approve: true,
      actor: fx.actor(fx.admin, true),
      now: NOW,
    });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: PROPOSED_KICKOFF,
      venueName: "League Reserved Field",
    });
  });

  it("detects a match-version race atomically and leaves both request and fixture unchanged", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    await respondToReschedule(prisma, {
      requestId: request.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await prisma.match.update({
      where: { id: fx.match.id },
      data: { venueName: "Admin corrected field", version: { increment: 1 } },
    });

    await expect(
      reviewRescheduleAsAdmin(prisma, {
        requestId: request.id,
        approve: true,
        actor: fx.actor(fx.admin, true),
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(
      prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } }),
    ).resolves.toMatchObject({ status: "PENDING_ADMIN", adminReviewedById: null });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: ORIGINAL_KICKOFF,
      venueName: "Admin corrected field",
      version: 8,
    });
  });

  it("provides an Admin rejection operation without mutating the fixture", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    await respondToReschedule(prisma, {
      requestId: request.id,
      approve: true,
      actor: fx.actor(fx.awayCaptain),
    });
    await expect(
      reviewRescheduleAsAdmin(prisma, {
        requestId: request.id,
        approve: false,
        actor: fx.actor(fx.homeCaptain),
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const rejected = await reviewRescheduleAsAdmin(prisma, {
      requestId: request.id,
      approve: false,
      reviewNote: "Field unavailable.",
      actor: fx.actor(fx.admin, true),
      now: NOW,
    });
    expect(rejected).toMatchObject({
      status: "REJECTED_ADMIN",
      openMatchKey: null,
      adminReviewedById: fx.admin.id,
    });
    await expect(
      prisma.rescheduleSlot.findUniqueOrThrow({ where: { id: request.slotId! } }),
    ).resolves.toMatchObject({ status: "AVAILABLE" });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: ORIGINAL_KICKOFF,
      venueName: "Original Field",
      version: 7,
    });
  });

  it("enforces one nullable open key per match at the database layer", async () => {
    const fx = await fixture();
    const request = await proposed(fx);

    await expect(
      prisma.rescheduleRequest.create({
        data: {
          matchId: fx.match.id,
          requestingTeamId: fx.away.id,
          requestedById: fx.awayCaptain.id,
          proposedKickoffAt: new Date("2026-10-25T19:00:00Z"),
          reason: "A concurrent proposal.",
          originalKickoffAt: fx.match.kickoffAt,
          originalVenueName: fx.match.venueName,
          expectedMatchVersion: fx.match.version,
          openMatchKey: fx.match.id,
        },
      }),
    ).rejects.toMatchObject({ code: "P2002" });

    await cancelReschedule(prisma, {
      requestId: request.id,
      actor: fx.actor(fx.homeCaptain),
    });
    await expect(
      prisma.rescheduleRequest.create({
        data: {
          matchId: fx.match.id,
          requestingTeamId: fx.away.id,
          requestedById: fx.awayCaptain.id,
          proposedKickoffAt: new Date("2026-10-25T19:00:00Z"),
          reason: "A new proposal after closure.",
          originalKickoffAt: fx.match.kickoffAt,
          originalVenueName: fx.match.venueName,
          expectedMatchVersion: fx.match.version,
          openMatchKey: fx.match.id,
        },
      }),
    ).resolves.toMatchObject({ status: "PENDING_OPPONENT", openMatchKey: fx.match.id });
  });

  it("returns explicit conflicts when revise, cancel, or opponent response loses a transition race", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    const operations = [
      (db: PrismaClient) =>
        reviseReschedule(db, {
          requestId: request.id,
          slotId: request.slotId!,
          reason: "Racing revision.",
          actor: fx.actor(fx.homeCaptain),
          now: NOW,
        }),
      (db: PrismaClient) =>
        cancelReschedule(db, {
          requestId: request.id,
          actor: fx.actor(fx.homeCaptain),
        }),
      (db: PrismaClient) =>
        respondToReschedule(db, {
          requestId: request.id,
          approve: true,
          actor: fx.actor(fx.awayCaptain),
        }),
    ];

    for (const operation of operations) {
      await expect(operation(clientWithTransitionRace())).rejects.toMatchObject({
        status: 409,
        code: "TRANSITION_CONFLICT",
      });
      await expect(
        prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: request.id } }),
      ).resolves.toMatchObject({
        status: "PENDING_OPPONENT",
        openMatchKey: fx.match.id,
      });
    }
  });

  it("enforces the 48-hour cutoff at submission even if a page was opened earlier", async () => {
    const fx = await fixture();
    const selectedSlot = await slot();
    const stalePageOpenedAt = new Date("2026-10-08T17:00:00Z");
    const submittedAt = new Date("2026-10-08T18:00:00Z");

    expect(ORIGINAL_KICKOFF.getTime() - stalePageOpenedAt.getTime()).toBeGreaterThan(
      48 * 60 * 60 * 1_000,
    );
    await expect(
      proposeReschedule(prisma, {
        matchId: fx.match.id,
        requestingTeamId: fx.home.id,
        slotId: selectedSlot.id,
        reason: "This form was left open across the cutoff.",
        actor: fx.actor(fx.homeCaptain),
        now: submittedAt,
      }),
    ).rejects.toMatchObject({ code: "CUTOFF_REACHED" });
    await expect(prisma.rescheduleRequest.count()).resolves.toBe(0);
  });

  it("blocks late opponent approval but still allows the request to be rejected and released", async () => {
    const fx = await fixture();
    const request = await proposed(fx);
    const cutoff = new Date(ORIGINAL_KICKOFF.getTime() - 48 * 60 * 60 * 1_000);

    await expect(
      respondToReschedule(prisma, {
        requestId: request.id,
        approve: true,
        actor: fx.actor(fx.awayCaptain),
        now: cutoff,
      }),
    ).rejects.toMatchObject({ code: "CUTOFF_REACHED" });
    await expect(
      respondToReschedule(prisma, {
        requestId: request.id,
        approve: false,
        responseNote: "The request reached the league cutoff.",
        actor: fx.actor(fx.awayCaptain),
        now: cutoff,
      }),
    ).resolves.toMatchObject({ status: "REJECTED_OPPONENT", activeSlotKey: null });
    await expect(
      prisma.rescheduleSlot.findUniqueOrThrow({ where: { id: request.slotId! } }),
    ).resolves.toMatchObject({ status: "AVAILABLE" });
  });

  it("allows an agreed pre-slot request to complete through the explicit legacy path", async () => {
    const fx = await fixture();
    const request = await prisma.rescheduleRequest.create({
      data: {
        matchId: fx.match.id,
        requestingTeamId: fx.home.id,
        requestedById: fx.homeCaptain.id,
        proposedKickoffAt: PROPOSED_KICKOFF,
        proposedVenueName: "Legacy Agreed Field",
        reason: "This request predates managed availability.",
        originalKickoffAt: fx.match.kickoffAt,
        originalVenueName: fx.match.venueName,
        expectedMatchVersion: fx.match.version,
        openMatchKey: fx.match.id,
        legacySlotExempt: true,
        status: "PENDING_ADMIN",
        respondedById: fx.awayCaptain.id,
        respondedAt: NOW,
      },
    });

    await expect(
      reviewRescheduleAsAdmin(prisma, {
        requestId: request.id,
        approve: true,
        reviewNote: "Honor the already-agreed legacy request.",
        actor: fx.actor(fx.admin, true),
        now: NOW,
      }),
    ).resolves.toMatchObject({ status: "APPROVED", slotId: null });
    await expect(
      prisma.match.findUniqueOrThrow({ where: { id: fx.match.id } }),
    ).resolves.toMatchObject({
      kickoffAt: PROPOSED_KICKOFF,
      venueName: "Legacy Agreed Field",
    });
  });

  it("reserves a slot for only one active request and releases it after cancellation", async () => {
    const fx = await fixture();
    const selectedSlot = await slot();
    const first = await proposeReschedule(prisma, {
      matchId: fx.match.id,
      requestingTeamId: fx.home.id,
      slotId: selectedSlot.id,
      reason: "Reserve the league slot.",
      actor: fx.actor(fx.homeCaptain),
      now: NOW,
    });
    const secondMatch = await prisma.match.create({
      data: {
        seasonId: fx.season.id,
        divisionId: fx.match.divisionId,
        homeTeamId: fx.home.id,
        awayTeamId: fx.away.id,
        kickoffAt: new Date("2026-10-11T18:00:00Z"),
        venueName: "Original Field 2",
        matchweek: "6",
      },
    });
    const secondProposal = {
      matchId: secondMatch.id,
      requestingTeamId: fx.away.id,
      slotId: selectedSlot.id,
      reason: "Try the same league slot.",
      actor: fx.actor(fx.awayCaptain),
      now: NOW,
    };

    await expect(proposeReschedule(prisma, secondProposal)).rejects.toMatchObject({
      code: "SLOT_UNAVAILABLE",
    });
    await cancelReschedule(prisma, {
      requestId: first.id,
      actor: fx.actor(fx.homeCaptain),
    });
    await expect(proposeReschedule(prisma, secondProposal)).resolves.toMatchObject({
      matchId: secondMatch.id,
      activeSlotKey: selectedSlot.id,
    });
  });

  it("migration converts and backfills a legacy pending request", async () => {
    const fx = await fixture();
    await prisma.$executeRawUnsafe('DROP TABLE "RescheduleRequest"');
    await prisma.$executeRawUnsafe('DROP TABLE "RescheduleSlot"');
    await prisma.$executeRawUnsafe(`
        CREATE TABLE "RescheduleRequest" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "matchId" TEXT NOT NULL,
          "requestingTeamId" TEXT NOT NULL,
          "requestedById" TEXT NOT NULL,
          "proposedKickoffAt" DATETIME,
          "proposedVenueName" TEXT,
          "reason" TEXT NOT NULL,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "respondedById" TEXT,
          "responseNote" TEXT,
          "respondedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        )
      `);
    await prisma.$executeRaw`
        INSERT INTO "RescheduleRequest" (
          "id", "matchId", "requestingTeamId", "requestedById",
          "proposedKickoffAt", "reason", "status", "updatedAt"
        ) VALUES (
          'legacy-request', ${fx.match.id}, ${fx.home.id}, ${fx.homeCaptain.id},
          ${PROPOSED_KICKOFF}, 'Legacy rationale', 'PENDING', ${NOW}
        )
      `;

    const migration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260922030000_reschedule_workflow",
        "migration.sql",
      ),
      "utf8",
    );
    for (const statement of migration
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    const slotMigration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260922190000_reschedule_slots",
        "migration.sql",
      ),
      "utf8",
    );
    for (const statement of slotMigration
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }
    const compatibilityMigration = fs.readFileSync(
      path.join(
        process.cwd(),
        "prisma",
        "migrations",
        "20260922191000_reschedule_legacy_compat",
        "migration.sql",
      ),
      "utf8",
    );
    for (const statement of compatibilityMigration
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)) {
      await prisma.$executeRawUnsafe(statement);
    }

    await expect(
      prisma.rescheduleRequest.findUniqueOrThrow({ where: { id: "legacy-request" } }),
    ).resolves.toMatchObject({
      status: "PENDING_OPPONENT",
      originalKickoffAt: ORIGINAL_KICKOFF,
      originalVenueName: "Original Field",
      expectedMatchVersion: 7,
      openMatchKey: fx.match.id,
      legacySlotExempt: true,
    });

    const defaulted = await prisma.rescheduleRequest.create({
      data: {
        matchId: fx.match.id,
        requestingTeamId: fx.away.id,
        requestedById: fx.awayCaptain.id,
        proposedKickoffAt: new Date("2026-11-01T19:00:00Z"),
        reason: "Checks the migrated table default.",
      },
    });
    expect(defaulted.status).toBe("PENDING_OPPONENT");
  });
});
