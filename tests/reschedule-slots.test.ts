import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  createRescheduleSlot,
  createRescheduleSlots,
  deleteRescheduleSlot,
  setRescheduleSlotAvailability,
  updateRescheduleSlot,
} from "@/lib/reschedule-slots";
import { parseRescheduleSlotRows, RescheduleSlotImportError } from "@/lib/reschedule-slot-import";

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

  it("imports multiple slots atomically and audits their source rows", async () => {
    const actor = await admin();
    const result = await createRescheduleSlots(prisma, {
      slots: [
        {
          kickoffAt: new Date("2026-10-20T19:00:00Z"),
          venueName: " Marymoor Turf A ",
          rowNumber: 2,
        },
        {
          kickoffAt: new Date("2026-10-21T20:30:00Z"),
          venueName: "Microsoft Soccer Field 1",
          rowNumber: 3,
        },
      ],
      actor,
      now: NOW,
    });

    expect(result).toEqual({ count: 2 });
    await expect(prisma.rescheduleSlot.count()).resolves.toBe(2);
    const audits = await prisma.auditLog.findMany({
      where: { action: "reschedule_slot.create" },
      orderBy: { createdAt: "asc" },
    });
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => JSON.parse(audit.metadata ?? "{}").importedFromRow)).toEqual([
      2, 3,
    ]);
  });

  it("rejects an invalid or duplicate batch without creating any slots", async () => {
    const actor = await admin();
    await expect(
      createRescheduleSlots(prisma, {
        slots: [
          {
            kickoffAt: new Date("2026-10-20T19:00:00Z"),
            venueName: "Marymoor Turf A",
            rowNumber: 2,
          },
          {
            kickoffAt: new Date("2026-08-20T19:00:00Z"),
            venueName: "Past Field",
            rowNumber: 3,
          },
        ],
        actor,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    await expect(prisma.rescheduleSlot.count()).resolves.toBe(0);

    await expect(
      createRescheduleSlots(prisma, {
        slots: [
          {
            kickoffAt: new Date("2026-10-20T19:00:00Z"),
            venueName: "Marymoor Turf A",
            rowNumber: 2,
          },
          {
            kickoffAt: new Date("2026-10-20T19:00:00Z"),
            venueName: "Marymoor Turf A",
            rowNumber: 4,
          },
        ],
        actor,
        now: NOW,
      }),
    ).rejects.toMatchObject({ code: "DUPLICATE" });
    await expect(prisma.rescheduleSlot.count()).resolves.toBe(0);
  });

  describe("reschedule slot workbook rows", () => {
    it("accepts Excel cells and text values and interprets them in Pacific time", () => {
      const rows = parseRescheduleSlotRows([
        ["Venue", "TIME", "Date"],
        ["Marymoor Turf A", 18.5 / 24, new Date("2026-10-20T00:00:00Z")],
        ["Microsoft Soccer Field 1", "7:15 PM", "10/21/2026"],
      ]);

      expect(rows).toEqual([
        {
          kickoffAt: new Date("2026-10-21T01:30:00Z"),
          venueName: "Marymoor Turf A",
          rowNumber: 2,
        },
        {
          kickoffAt: new Date("2026-10-22T02:15:00Z"),
          venueName: "Microsoft Soccer Field 1",
          rowNumber: 3,
        },
      ]);
    });

    it("reports missing headers and invalid cells with workbook row numbers", () => {
      expect(() => parseRescheduleSlotRows([["date", "venue"]])).toThrow(
        "Missing required column: time.",
      );
      expect(() =>
        parseRescheduleSlotRows([
          ["date", "time", "venue"],
          ["not a date", "25:00", ""],
        ]),
      ).toThrow(RescheduleSlotImportError);
      expect(() =>
        parseRescheduleSlotRows([
          ["date", "time", "venue"],
          ["not a date", "25:00", ""],
        ]),
      ).toThrow(/Row 2/);
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

  it("deletes and audits only disabled slots", async () => {
    const actor = await admin();
    const slot = await createRescheduleSlot(prisma, {
      kickoffAt: new Date("2026-10-20T19:00:00Z"),
      venueName: "Marymoor Turf A",
      actor,
      now: NOW,
    });

    await expect(deleteRescheduleSlot(prisma, { slotId: slot.id, actor })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await setRescheduleSlotAvailability(prisma, {
      slotId: slot.id,
      available: false,
      actor,
    });
    await deleteRescheduleSlot(prisma, { slotId: slot.id, actor });

    await expect(prisma.rescheduleSlot.findUnique({ where: { id: slot.id } })).resolves.toBeNull();
    await expect(
      prisma.auditLog.findFirstOrThrow({
        where: { entityId: slot.id, action: "reschedule_slot.delete" },
      }),
    ).resolves.toMatchObject({ actorRole: "admin" });
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
