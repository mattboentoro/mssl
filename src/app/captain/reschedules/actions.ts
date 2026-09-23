"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requireCaptain } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  cancelReschedule,
  proposeReschedule,
  RescheduleError,
  respondToReschedule,
  reviseReschedule,
} from "@/lib/reschedules";

export interface RescheduleActionState {
  ok?: string;
  error?: string;
}

function refreshReschedules() {
  revalidatePath("/captain/reschedules");
  revalidatePath("/schedule");
  revalidatePath("/teams/[id]", "page");
}

function actor(user: Awaited<ReturnType<typeof requireCaptain>>) {
  return { appUserId: user.appUserId, email: user.email, name: user.name };
}

function errorState(error: unknown): RescheduleActionState {
  if (error instanceof AuthzError || error instanceof RescheduleError) {
    return { error: error.message };
  }
  console.error("[reschedule] action failed", error);
  return { error: "The reschedule request could not be updated. Please try again." };
}

export async function proposeRescheduleAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  try {
    const user = await requireCaptain();
    await proposeReschedule(prisma, {
      matchId: String(formData.get("matchId") ?? ""),
      requestingTeamId: String(formData.get("requestingTeamId") ?? ""),
      slotId: String(formData.get("slotId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      actor: actor(user),
    });
    refreshReschedules();
    return { ok: "Proposal sent to the opposing team." };
  } catch (error) {
    return errorState(error);
  }
}

export async function reviseRescheduleAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  try {
    const user = await requireCaptain();
    await reviseReschedule(prisma, {
      requestId: String(formData.get("requestId") ?? ""),
      slotId: String(formData.get("slotId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      actor: actor(user),
    });
    refreshReschedules();
    return { ok: "Proposal revised and the opposing team notified." };
  } catch (error) {
    return errorState(error);
  }
}

export async function cancelRescheduleAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  try {
    const user = await requireCaptain();
    await cancelReschedule(prisma, {
      requestId: String(formData.get("requestId") ?? ""),
      actor: actor(user),
    });
    refreshReschedules();
    return { ok: "Reschedule request cancelled." };
  } catch (error) {
    return errorState(error);
  }
}

export async function respondToRescheduleAction(
  _previous: RescheduleActionState,
  formData: FormData,
): Promise<RescheduleActionState> {
  try {
    const user = await requireCaptain();
    const decision = String(formData.get("decision") ?? "");
    if (decision !== "approve" && decision !== "reject") {
      throw new RescheduleError("Choose approve or reject.", 422, "VALIDATION_FAILED");
    }
    await respondToReschedule(prisma, {
      requestId: String(formData.get("requestId") ?? ""),
      approve: decision === "approve",
      responseNote: String(formData.get("responseNote") ?? ""),
      actor: actor(user),
    });
    refreshReschedules();
    return {
      ok:
        decision === "approve"
          ? "Sent to league administrators for final review."
          : "Proposal rejected.",
    };
  } catch (error) {
    return errorState(error);
  }
}
