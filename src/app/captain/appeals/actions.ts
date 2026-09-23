"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requireCaptain } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { cancelScoreAppeal, ScoreAppealError, submitScoreAppeal } from "@/lib/score-appeals";

export interface ScoreAppealActionState {
  ok?: string;
  error?: string;
}

export async function submitScoreAppealAction(
  _previous: ScoreAppealActionState,
  formData: FormData,
): Promise<ScoreAppealActionState> {
  try {
    const user = await requireCaptain();
    const homeScore = formData.get("requestedHomeScore");
    const awayScore = formData.get("requestedAwayScore");
    if (homeScore === null || homeScore === "" || awayScore === null || awayScore === "") {
      return { error: "Both requested scores are required." };
    }
    await submitScoreAppeal(prisma, {
      matchId: String(formData.get("matchId") ?? ""),
      teamId: String(formData.get("teamId") ?? ""),
      reason: String(formData.get("reason") ?? ""),
      requestedHomeScore: Number(homeScore),
      requestedAwayScore: Number(awayScore),
      requestedHomeForfeit: formData.get("requestedHomeForfeit") === "on",
      requestedAwayForfeit: formData.get("requestedAwayForfeit") === "on",
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    });
    revalidatePath("/captain/appeals");
    return { ok: "The score appeal was submitted for administrator review." };
  } catch (error) {
    if (error instanceof AuthzError || error instanceof ScoreAppealError) {
      return { error: error.message };
    }
    console.error("[score-appeal] submit failed", error);
    return { error: "The appeal could not be submitted. Please try again." };
  }
}

export async function cancelScoreAppealAction(
  _previous: ScoreAppealActionState,
  formData: FormData,
): Promise<ScoreAppealActionState> {
  try {
    const user = await requireCaptain();
    await cancelScoreAppeal(prisma, {
      appealId: String(formData.get("appealId") ?? ""),
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    });
    revalidatePath("/captain/appeals");
    return { ok: "The appeal was cancelled." };
  } catch (error) {
    if (error instanceof AuthzError || error instanceof ScoreAppealError) {
      return { error: error.message };
    }
    console.error("[score-appeal] cancel failed", error);
    return { error: "The appeal could not be cancelled. Please try again." };
  }
}
