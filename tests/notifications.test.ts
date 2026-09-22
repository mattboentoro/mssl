import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  broadcastToTeam,
  createNotification,
  isSafeInternalHref,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationError,
  unreadNotificationCount,
} from "@/lib/notifications";

const prisma = new PrismaClient();

async function resetDatabase() {
  await prisma.notification.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.teamCaptain.deleteMany();
  await prisma.globalRoleAssignment.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.seasonTeam.deleteMany();
  await prisma.team.deleteMany();
  await prisma.division.deleteMany();
  await prisma.season.deleteMany();
  await prisma.referee.deleteMany();
  await prisma.appUser.deleteMany();
}

async function user(name: string, status = "ACTIVE") {
  const normalized = `${name.toLowerCase()}@example.com`;
  return prisma.appUser.create({
    data: {
      entraObjectId: `entra-${name.toLowerCase()}`,
      email: normalized,
      normalizedEmail: normalized,
      displayName: name,
      status,
    },
  });
}

async function teamFixture() {
  const season = await prisma.season.create({
    data: {
      name: "Notification Season",
      slug: "notification-season",
      startsOn: new Date("2026-01-01"),
      endsOn: new Date("2026-12-31"),
      isActive: true,
    },
  });
  const division = await prisma.division.create({
    data: { name: "Notification Division", slug: "notification-division" },
  });
  const team = await prisma.team.create({
    data: {
      divisionId: division.id,
      name: "Notification FC",
      slug: "notification-fc",
      shortName: "NFC",
    },
  });
  return { season, team };
}

beforeEach(resetDatabase);
afterAll(async () => prisma.$disconnect());

describe("in-app notifications", () => {
  it("isolates list, unread count, and reads to the recipient", async () => {
    const alice = await user("Alice");
    const bob = await user("Bob");
    const aliceNotification = await createNotification(prisma, {
      userId: alice.id,
      type: "TEST",
      title: "Alice only",
      body: "Private update",
      href: "/schedule?team=alice",
    });
    await createNotification(prisma, {
      userId: bob.id,
      type: "TEST",
      title: "Bob only",
      body: "Another update",
    });

    await expect(listNotifications(prisma, alice.id)).resolves.toEqual([
      expect.objectContaining({ id: aliceNotification.id, title: "Alice only" }),
    ]);
    await expect(unreadNotificationCount(prisma, alice.id)).resolves.toBe(1);
    await expect(
      markNotificationRead(prisma, {
        userId: bob.id,
        notificationId: aliceNotification.id,
      }),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    } satisfies Partial<NotificationError>);
    expect(await unreadNotificationCount(prisma, alice.id)).toBe(1);
  });

  it("makes individual and bulk read operations idempotent", async () => {
    const alice = await user("Alice");
    const first = await createNotification(prisma, {
      userId: alice.id,
      type: "TEST",
      title: "First",
      body: "One",
    });
    await createNotification(prisma, {
      userId: alice.id,
      type: "TEST",
      title: "Second",
      body: "Two",
    });

    expect(await markNotificationRead(prisma, { userId: alice.id, notificationId: first.id })).toBe(
      true,
    );
    expect(await markNotificationRead(prisma, { userId: alice.id, notificationId: first.id })).toBe(
      false,
    );
    expect(await markAllNotificationsRead(prisma, { userId: alice.id })).toBe(1);
    expect(await markAllNotificationsRead(prisma, { userId: alice.id })).toBe(0);
  });

  it("accepts only internal application links", async () => {
    expect(isSafeInternalHref("/teams/example?tab=fixtures")).toBe(true);
    for (const href of [
      "https://attacker.example",
      "//attacker.example",
      "/\\attacker.example",
      "/%2f%2fattacker.example",
      "/%5c%5cattacker.example",
      "javascript:alert(1)",
      "/safe\nLocation: https://attacker.example",
    ]) {
      expect(isSafeInternalHref(href)).toBe(false);
    }

    const alice = await user("Alice");
    await expect(
      createNotification(prisma, {
        userId: alice.id,
        type: "TEST",
        title: "Unsafe",
        body: "Unsafe link",
        href: "//attacker.example",
      }),
    ).rejects.toMatchObject({ code: "INVALID_NOTIFICATION" });
  });

  it("broadcasts only to active teammates and co-captains, deduplicates, and audits", async () => {
    const { season, team } = await teamFixture();
    const captain = await user("Captain");
    const coCaptain = await user("CoCaptain");
    const player = await user("Player");
    const inactive = await user("Inactive", "DISABLED");
    for (const [subject, sortOrder] of [
      [captain, 0],
      [coCaptain, 1],
    ] as const) {
      await prisma.teamCaptain.create({
        data: {
          seasonId: season.id,
          teamId: team.id,
          userId: subject.id,
          name: subject.displayName,
          status: "ACTIVE",
          sortOrder,
        },
      });
    }
    for (const subject of [coCaptain, player, inactive]) {
      await prisma.teamMembership.create({
        data: {
          seasonId: season.id,
          teamId: team.id,
          userId: subject.id,
        },
      });
    }

    await expect(
      broadcastToTeam(prisma, {
        actorId: captain.id,
        actor: { id: captain.id, email: captain.email, name: captain.displayName, role: "captain" },
        seasonId: season.id,
        teamId: team.id,
        title: "Training",
        body: "Training starts at 6.",
      }),
    ).resolves.toEqual({ recipientCount: 2 });

    expect(
      await prisma.notification.findMany({
        orderBy: { userId: "asc" },
        select: { userId: true, href: true },
      }),
    ).toEqual(
      [coCaptain.id, player.id]
        .sort()
        .map((userId) => ({ userId, href: `/teams/${encodeURIComponent(team.id)}` })),
    );
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { action: "notification.team_broadcast", entityId: team.id },
      }),
    ).resolves.toMatchObject({
      actorId: captain.id,
      metadata: expect.stringContaining('"recipientCount":2'),
    });
  });

  it("rejects broadcasts from a user outside the captain assignment", async () => {
    const { season, team } = await teamFixture();
    const outsider = await user("Outsider");
    await expect(
      broadcastToTeam(prisma, {
        actorId: outsider.id,
        actor: { id: outsider.id },
        seasonId: season.id,
        teamId: team.id,
        title: "No",
        body: "Not permitted",
      }),
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("rejects a broadcast above the recipient bound without partial writes", async () => {
    const { season, team } = await teamFixture();
    const captain = await user("Captain");
    await prisma.teamCaptain.create({
      data: {
        seasonId: season.id,
        teamId: team.id,
        userId: captain.id,
        name: captain.displayName,
        status: "ACTIVE",
      },
    });
    await prisma.appUser.createMany({
      data: Array.from({ length: 101 }, (_, index) => ({
        entraObjectId: `bounded-${index}`,
        email: `bounded-${index}@example.com`,
        normalizedEmail: `bounded-${index}@example.com`,
        displayName: `Bounded ${index}`,
        status: "ACTIVE",
      })),
    });
    const recipients = await prisma.appUser.findMany({
      where: { entraObjectId: { startsWith: "bounded-" } },
      select: { id: true },
    });
    await prisma.teamMembership.createMany({
      data: recipients.map(({ id: userId }) => ({
        seasonId: season.id,
        teamId: team.id,
        userId,
      })),
    });

    await expect(
      broadcastToTeam(prisma, {
        actorId: captain.id,
        actor: { id: captain.id },
        seasonId: season.id,
        teamId: team.id,
        title: "Too many",
        body: "This must not fan out.",
      }),
    ).rejects.toMatchObject({ status: 409, code: "RECIPIENT_LIMIT" });
    expect(await prisma.notification.count()).toBe(0);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});
