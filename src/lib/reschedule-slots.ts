import { Prisma, type PrismaClient, type RescheduleSlot } from "@prisma/client";

import { toAuditActor, writeAudit } from "@/lib/audit";

export const RESCHEDULE_SLOT_STATUSES = ["AVAILABLE", "RESERVED", "DISABLED", "USED"] as const;
export type RescheduleSlotStatus = (typeof RESCHEDULE_SLOT_STATUSES)[number];

export class RescheduleSlotError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "DUPLICATE" | "VALIDATION_FAILED",
  ) {
    super(message);
    this.name = "RescheduleSlotError";
  }
}

interface AdminActor {
  appUserId: string;
  email?: string | null;
  name?: string | null;
}

export interface ImportRescheduleSlotInput {
  kickoffAt: Date;
  venueName: string;
  rowNumber: number;
}

function validateSlot(kickoffAt: Date, venueName: string, now: Date, rowNumber?: number) {
  const prefix = rowNumber === undefined ? "" : `Row ${rowNumber}: `;
  const venue = venueName.trim();
  if (Number.isNaN(kickoffAt.getTime()) || kickoffAt.getTime() <= now.getTime()) {
    throw new RescheduleSlotError(
      `${prefix}the slot must use a valid future date and time.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  if (!venue || venue.length > 300) {
    throw new RescheduleSlotError(
      `${prefix}venue is required and must be 300 characters or fewer.`,
      422,
      "VALIDATION_FAILED",
    );
  }
  return venue;
}

export async function createRescheduleSlot(
  db: PrismaClient,
  input: { kickoffAt: Date; venueName: string; actor: AdminActor; now?: Date },
): Promise<RescheduleSlot> {
  const now = input.now ?? new Date();
  const venueName = validateSlot(input.kickoffAt, input.venueName, now);
  try {
    return await db.$transaction(async (tx) => {
      const slot = await tx.rescheduleSlot.create({
        data: {
          kickoffAt: input.kickoffAt,
          venueName,
          createdById: input.actor.appUserId,
        },
      });
      await writeAudit(tx, {
        actor: toAuditActor(input.actor, "admin"),
        action: "reschedule_slot.create",
        entity: "RescheduleSlot",
        entityId: slot.id,
        metadata: { kickoffAt: slot.kickoffAt, venueName: slot.venueName },
      });
      return slot;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RescheduleSlotError("That date, time, and venue already exist.", 409, "DUPLICATE");
    }
    throw error;
  }
}

export async function createRescheduleSlots(
  db: PrismaClient,
  input: {
    slots: ImportRescheduleSlotInput[];
    actor: AdminActor;
    now?: Date;
  },
): Promise<{ count: number }> {
  if (input.slots.length === 0) {
    throw new RescheduleSlotError(
      "The workbook does not contain any availability rows.",
      422,
      "VALIDATION_FAILED",
    );
  }
  if (input.slots.length > 500) {
    throw new RescheduleSlotError(
      "A workbook can contain at most 500 availability rows.",
      422,
      "VALIDATION_FAILED",
    );
  }

  const now = input.now ?? new Date();
  const slots = input.slots.map((slot) => ({
    ...slot,
    venueName: validateSlot(slot.kickoffAt, slot.venueName, now, slot.rowNumber),
  }));
  const seen = new Map<string, number>();
  for (const slot of slots) {
    const key = slotKey(slot.kickoffAt, slot.venueName);
    const duplicateRow = seen.get(key);
    if (duplicateRow !== undefined) {
      throw new RescheduleSlotError(
        `Rows ${duplicateRow} and ${slot.rowNumber} contain the same date, time, and venue.`,
        409,
        "DUPLICATE",
      );
    }
    seen.set(key, slot.rowNumber);
  }

  const existing = await db.rescheduleSlot.findMany({
    where: {
      OR: slots.map((slot) => ({
        kickoffAt: slot.kickoffAt,
        venueName: slot.venueName,
      })),
    },
    select: { kickoffAt: true, venueName: true },
  });
  if (existing.length > 0) {
    const existingKeys = new Set(existing.map((slot) => slotKey(slot.kickoffAt, slot.venueName)));
    const duplicate = slots.find((slot) =>
      existingKeys.has(slotKey(slot.kickoffAt, slot.venueName)),
    );
    throw new RescheduleSlotError(
      `Row ${duplicate?.rowNumber ?? "unknown"} duplicates existing availability.`,
      409,
      "DUPLICATE",
    );
  }

  try {
    return await db.$transaction(async (tx) => {
      for (const slotInput of slots) {
        const slot = await tx.rescheduleSlot.create({
          data: {
            kickoffAt: slotInput.kickoffAt,
            venueName: slotInput.venueName,
            createdById: input.actor.appUserId,
          },
        });
        await writeAudit(tx, {
          actor: toAuditActor(input.actor, "admin"),
          action: "reschedule_slot.create",
          entity: "RescheduleSlot",
          entityId: slot.id,
          metadata: {
            kickoffAt: slot.kickoffAt,
            venueName: slot.venueName,
            importedFromRow: slotInput.rowNumber,
          },
        });
      }
      return { count: slots.length };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RescheduleSlotError(
        "One or more rows duplicate existing availability.",
        409,
        "DUPLICATE",
      );
    }
    throw error;
  }
}

function slotKey(kickoffAt: Date, venueName: string) {
  return `${kickoffAt.toISOString()}\u0000${venueName.trim()}`;
}

export async function updateRescheduleSlot(
  db: PrismaClient,
  input: {
    slotId: string;
    kickoffAt: Date;
    venueName: string;
    expectedUpdatedAt: Date;
    actor: AdminActor;
    now?: Date;
  },
): Promise<RescheduleSlot> {
  const now = input.now ?? new Date();
  const venueName = validateSlot(input.kickoffAt, input.venueName, now);
  try {
    return await db.$transaction(async (tx) => {
      const slot = await tx.rescheduleSlot.findUnique({ where: { id: input.slotId } });
      if (!slot) {
        throw new RescheduleSlotError("Reschedule slot not found.", 404, "NOT_FOUND");
      }
      if (slot.status !== "AVAILABLE") {
        throw new RescheduleSlotError(
          "A disabled, reserved, or used slot cannot be edited.",
          409,
          "INVALID_STATE",
        );
      }
      const changed = await tx.rescheduleSlot.updateMany({
        where: { id: slot.id, status: "AVAILABLE", updatedAt: input.expectedUpdatedAt },
        data: { kickoffAt: input.kickoffAt, venueName },
      });
      if (changed.count !== 1) {
        throw new RescheduleSlotError(
          "This slot changed while you were editing it. Refresh and try again.",
          409,
          "INVALID_STATE",
        );
      }
      await writeAudit(tx, {
        actor: toAuditActor(input.actor, "admin"),
        action: "reschedule_slot.update",
        entity: "RescheduleSlot",
        entityId: slot.id,
        metadata: {
          before: { kickoffAt: slot.kickoffAt, venueName: slot.venueName },
          after: { kickoffAt: input.kickoffAt, venueName },
        },
      });
      return tx.rescheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new RescheduleSlotError("That date, time, and venue already exist.", 409, "DUPLICATE");
    }
    throw error;
  }
}

export async function setRescheduleSlotAvailability(
  db: PrismaClient,
  input: { slotId: string; available: boolean; actor: AdminActor },
): Promise<RescheduleSlot> {
  return db.$transaction(async (tx) => {
    const slot = await tx.rescheduleSlot.findUnique({ where: { id: input.slotId } });
    if (!slot) {
      throw new RescheduleSlotError("Reschedule slot not found.", 404, "NOT_FOUND");
    }
    if (slot.status === "USED") {
      throw new RescheduleSlotError(
        "A used slot cannot be made available again.",
        409,
        "INVALID_STATE",
      );
    }
    const status: RescheduleSlotStatus = input.available ? "AVAILABLE" : "DISABLED";
    const expectedStatus = input.available ? "DISABLED" : "AVAILABLE";
    if (slot.status !== expectedStatus) {
      throw new RescheduleSlotError(
        `Only ${expectedStatus.toLowerCase()} slots can be ${input.available ? "enabled" : "disabled"}.`,
        409,
        "INVALID_STATE",
      );
    }
    const changed = await tx.rescheduleSlot.updateMany({
      where: { id: slot.id, status: expectedStatus, updatedAt: slot.updatedAt },
      data: { status, disabledAt: input.available ? null : new Date() },
    });
    if (changed.count !== 1) {
      throw new RescheduleSlotError(
        "This slot changed while availability was being updated.",
        409,
        "INVALID_STATE",
      );
    }
    const updated = await tx.rescheduleSlot.findUniqueOrThrow({ where: { id: slot.id } });
    await writeAudit(tx, {
      actor: toAuditActor(input.actor, "admin"),
      action: input.available ? "reschedule_slot.enable" : "reschedule_slot.disable",
      entity: "RescheduleSlot",
      entityId: slot.id,
      metadata: { before: { status: slot.status }, after: { status } },
    });
    return updated;
  });
}
