import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRescheduleSlot,
  setRescheduleSlotAvailability,
  updateRescheduleSlot,
} from "@/lib/reschedule-slots";

const prisma = new PrismaClient();
const NOW = new Date("2026-09-01T12:00:00Z");

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.rescheduleRequest.deleteMany();
  await prisma.rescheduleSlot.deleteMany();
  await prisma.appUser.deleteMany();
});

afterAll(async () => prisma.$disconnect());

async function admin() {
  const user = await prisma.appUser.create({
    data: {
      entraObjectId: "slot-admin",
      email: "slot-admin@example.com",
      normalizedEmail: "slot-admin@example.com",
      displayName: "Slot Admin",
      status: "ACTIVE",
    },
  });
  return { appUserId: user.id, email: user.email, name: user.displayName };
}

describe("reschedule availability slots", () => {
  it("creates and audits a future date, time, and venue", async () => {
    const actor = await admin();
    const slot = await createRescheduleSlot(prisma, {
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "  Marymoor Turf A ",
      actor,
      now: NOW,
    });

    expect(slot).toMatchObject({ venueName: "Marymoor Turf A", status: "AVAILABLE" });
    await expect(
      prisma.auditLog.findFirstOrThrow({ where: { entityId: slot.id } }),
    ).resolves.toMatchObject({ action: "reschedule_slot.create", actorRole: "admin" });
  });

  it("rejects past or duplicate slots", async () => {
    const actor = await admin();
    await expect(
      createRescheduleSlot(prisma, {
        kickoffAt: new Date("2026-08-20T19:00:00Z"),
        venueName: "Past Field",
        actor,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    const input = {
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "Marymoor Turf A",
      actor,
      now: NOW,
    };
    await createRescheduleSlot(prisma, input);
    await expect(createRescheduleSlot(prisma, input)).rejects.toMatchObject({
      code: "DUPLICATE",
    });
  });

  it("edits with stale-write protection and can disable or re-enable availability", async () => {
    const actor = await admin();
    const slot = await createRescheduleSlot(prisma, {
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "Marymoor Turf A",
      actor,
      now: NOW,
    });
    const updated = await updateRescheduleSlot(prisma, {
      slotId: slot.id,
      kickoffAt: new Date("2026-10-21T20:00:00Z"),
      venueName: "Microsoft Soccer Field 1",
      expectedUpdatedAt: slot.updatedAt,
      actor,
      now: NOW,
    });
    expect(updated).toMatchObject({ venueName: "Microsoft Soccer Field 1" });
    await expect(
      updateRescheduleSlot(prisma, {
        slotId: slot.id,
        kickoffAt: new Date("2026-10-22T20:00:00Z"),
        venueName: "Stale Field",
        expectedUpdatedAt: slot.updatedAt,
        actor,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });

    await expect(
      setRescheduleSlotAvailability(prisma, { slotId: slot.id, available: false, actor }),
    ).resolves.toMatchObject({ status: "DISABLED" });
    await expect(
      setRescheduleSlotAvailability(prisma, { slotId: slot.id, available: true, actor }),
    ).resolves.toMatchObject({ status: "AVAILABLE" });
  });

  it("does not let Admin edits or disabling overwrite a concurrent reservation", async () => {
    const actor = await admin();
    const slot = await createRescheduleSlot(prisma, {
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "Marymoor Turf A",
      actor,
      now: NOW,
    });
    await prisma.rescheduleSlot.update({
      where: { id: slot.id },
      data: { status: "RESERVED" },
    });

    await expect(
      updateRescheduleSlot(prisma, {
        slotId: slot.id,
        kickoffAt: new Date("2026-10-21T19:00:00Z"),
        venueName: "Changed Under Reservation",
        expectedUpdatedAt: slot.updatedAt,
        actor,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      setRescheduleSlotAvailability(prisma, {
        slotId: slot.id,
        available: false,
        actor,
      }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
    await expect(
      prisma.rescheduleSlot.findUniqueOrThrow({ where: { id: slot.id } }),
    ).resolves.toMatchObject({
      status: "RESERVED",
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "Marymoor Turf A",
    });
  });
});
