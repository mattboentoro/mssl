"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requireAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  createRescheduleSlot,
  RescheduleSlotError,
  setRescheduleSlotAvailability,
  updateRescheduleSlot,
} from "@/lib/reschedule-slots";
import { parseLeagueDateTime } from "@/lib/timezone";

export interface RescheduleSlotActionState {
  ok?: string;
  error?: string;
}

function value(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

function kickoff(form: FormData) {
  const parsed = parseLeagueDateTime(value(form, "kickoffAt"));
  if (!parsed) {
    throw new RescheduleSlotError("Enter a valid date and time.", 422, "VALIDATION_FAILED");
  }
  return parsed;
}

function actor(user: Awaited<ReturnType<typeof requireAdmin>>) {
  return { appUserId: user.appUserId, email: user.email, name: user.name };
}

function refresh() {
  revalidatePath("/admin/reschedule-slots");
  revalidatePath("/captain/reschedules");
  revalidatePath("/teams/[id]", "page");
}

function failure(error: unknown): RescheduleSlotActionState {
  if (error instanceof AuthzError || error instanceof RescheduleSlotError) {
    return { error: error.message };
  }
  console.error("[reschedule-slot] action failed", error);
  return { error: "The reschedule slot could not be saved. Refresh and try again." };
}

export async function createRescheduleSlotAction(
  _state: RescheduleSlotActionState,
  form: FormData,
): Promise<RescheduleSlotActionState> {
  try {
    const user = await requireAdmin();
    await createRescheduleSlot(prisma, {
      kickoffAt: kickoff(form),
      venueName: value(form, "venueName"),
      actor: actor(user),
    });
    refresh();
    return { ok: "Reschedule slot added." };
  } catch (error) {
    return failure(error);
  }
}

export async function updateRescheduleSlotAction(
  _state: RescheduleSlotActionState,
  form: FormData,
): Promise<RescheduleSlotActionState> {
  try {
    const user = await requireAdmin();
    await updateRescheduleSlot(prisma, {
      slotId: value(form, "slotId"),
      kickoffAt: kickoff(form),
      venueName: value(form, "venueName"),
      expectedUpdatedAt: new Date(value(form, "expectedUpdatedAt")),
      actor: actor(user),
    });
    refresh();
    return { ok: "Reschedule slot updated." };
  } catch (error) {
    return failure(error);
  }
}

export async function setRescheduleSlotAvailabilityAction(
  _state: RescheduleSlotActionState,
  form: FormData,
): Promise<RescheduleSlotActionState> {
  try {
    const user = await requireAdmin();
    await setRescheduleSlotAvailability(prisma, {
      slotId: value(form, "slotId"),
      available: value(form, "available") === "true",
      actor: actor(user),
    });
    refresh();
    return { ok: value(form, "available") === "true" ? "Slot enabled." : "Slot disabled." };
  } catch (error) {
    return failure(error);
  }
}
