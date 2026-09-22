"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requireAdmin, requireParticipantCaptain } from "@/lib/authz";
import {
  CaptainResultError,
  respondToCaptainResult,
  reviewCaptainResult,
  submitCaptainResult,
} from "@/lib/captain-results";
import { prisma } from "@/lib/prisma";
import { captainResultSchema } from "@/lib/validation";

export interface CaptainResultActionState {
  ok?: string;
  error?: string;
}

function resultError(error: unknown): CaptainResultActionState {
  if (error instanceof AuthzError || error instanceof CaptainResultError) {
    return { error: error.message };
  }
  console.error("[captain-result] action failed", error);
  return { error: "The result could not be updated. Refresh and try again." };
}

function refresh(matchId: string) {
  revalidatePath("/captain");
  revalidatePath("/captain/results");
  revalidatePath(`/captain/results/${matchId}`);
  revalidatePath("/schedule");
  revalidatePath("/standings");
}

export async function submitCaptainResultAction(
  _previous: CaptainResultActionState,
  formData: FormData,
): Promise<CaptainResultActionState> {
  const matchId = String(formData.get("matchId") ?? "");
  try {
    const context = await requireParticipantCaptain(matchId);
    const parsed = captainResultSchema.safeParse({
      homeScore: formData.has("homeScore") ? Number(formData.get("homeScore")) : Number.NaN,
      awayScore: formData.has("awayScore") ? Number(formData.get("awayScore")) : Number.NaN,
      homeForfeit: formData.get("homeForfeit") === "on",
      awayForfeit: formData.get("awayForfeit") === "on",
      notes: String(formData.get("notes") ?? ""),
    });
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid result." };
    await submitCaptainResult(prisma, {
      matchId,
      teamId: context.teamId,
      actor: {
        appUserId: context.user.appUserId,
        email: context.user.email,
        name: context.user.name,
      },
      result: parsed.data,
    });
    refresh(matchId);
    return { ok: "Result sent to the opposing Captain." };
  } catch (error) {
    return resultError(error);
  }
}

export async function respondToCaptainResultAction(
  _previous: CaptainResultActionState,
  formData: FormData,
): Promise<CaptainResultActionState> {
  const matchId = String(formData.get("matchId") ?? "");
  try {
    const context = await requireParticipantCaptain(matchId);
    await respondToCaptainResult(prisma, {
      proposalId: String(formData.get("proposalId") ?? ""),
      teamId: context.teamId,
      approve: formData.get("decision") === "approve",
      note: String(formData.get("note") ?? ""),
      actor: {
        appUserId: context.user.appUserId,
        email: context.user.email,
        name: context.user.name,
      },
    });
    refresh(matchId);
    return { ok: "Your response was recorded." };
  } catch (error) {
    return resultError(error);
  }
}

/** Contract for the Admin review UI implemented separately. */
export async function reviewCaptainResultAction(
  _previous: CaptainResultActionState,
  formData: FormData,
): Promise<CaptainResultActionState> {
  const matchId = String(formData.get("matchId") ?? "");
  try {
    const user = await requireAdmin();
    await reviewCaptainResult(prisma, {
      proposalId: String(formData.get("proposalId") ?? ""),
      approve: formData.get("decision") === "approve",
      note: String(formData.get("note") ?? ""),
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    });
    refresh(matchId);
    revalidatePath("/admin/captain-results");
    return { ok: "The Captain result was reviewed." };
  } catch (error) {
    return resultError(error);
  }
}
