"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, AuthzError } from "@/lib/authz";
import { CaptainResultError, reviewCaptainResult } from "@/lib/captain-results";
import { prisma } from "@/lib/prisma";
import { RescheduleError, reviewRescheduleAsAdmin } from "@/lib/reschedules";
import { acceptScoreAppeal, rejectScoreAppeal, ScoreAppealError } from "@/lib/score-appeals";

export interface AdminWorkflowActionState {
  ok?: string;
  error?: string;
}

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function decision(form: FormData): "approve" | "reject" {
  const result = value(form, "decision");
  if (result !== "approve" && result !== "reject") {
    throw new Error("Invalid review decision.");
  }
  return result;
}

function refresh(matchId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/workflows");
  revalidatePath("/admin/matches");
  if (matchId) revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath("/schedule");
  revalidatePath("/standings");
  revalidatePath("/notifications");
}

function knownError(error: unknown): AdminWorkflowActionState {
  if (
    error instanceof AuthzError ||
    error instanceof RescheduleError ||
    error instanceof CaptainResultError ||
    error instanceof ScoreAppealError
  ) {
    return { error: error.message };
  }
  console.error("[admin-workflow] action failed", error);
  return { error: "The review could not be saved. Refresh and try again." };
}

export async function reviewRescheduleAction(
  _state: AdminWorkflowActionState,
  form: FormData,
): Promise<AdminWorkflowActionState> {
  const matchId = value(form, "matchId");
  try {
    const user = await requireAdmin();
    const selected = decision(form);
    await reviewRescheduleAsAdmin(prisma, {
      requestId: value(form, "requestId"),
      approve: selected === "approve",
      reviewNote: value(form, "reviewNote"),
      actor: {
        appUserId: user.appUserId,
        email: user.email,
        name: user.name,
        isAdmin: true,
      },
    });
    refresh(matchId);
    return { ok: `Reschedule ${selected === "approve" ? "approved" : "rejected"}.` };
  } catch (error) {
    return knownError(error);
  }
}

export async function reviewCaptainResultAdminAction(
  _state: AdminWorkflowActionState,
  form: FormData,
): Promise<AdminWorkflowActionState> {
  const matchId = value(form, "matchId");
  try {
    const user = await requireAdmin();
    const selected = decision(form);
    await reviewCaptainResult(prisma, {
      proposalId: value(form, "proposalId"),
      approve: selected === "approve",
      note: value(form, "reviewNote"),
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    });
    refresh(matchId);
    return { ok: `Captain result ${selected === "approve" ? "approved" : "rejected"}.` };
  } catch (error) {
    return knownError(error);
  }
}

export async function reviewScoreAppealAction(
  _state: AdminWorkflowActionState,
  form: FormData,
): Promise<AdminWorkflowActionState> {
  const matchId = value(form, "matchId");
  try {
    const user = await requireAdmin();
    const selected = decision(form);
    const input = {
      appealId: value(form, "appealId"),
      resolutionNote: value(form, "resolutionNote"),
      actor: { appUserId: user.appUserId, email: user.email, name: user.name },
    };
    if (selected === "approve") await acceptScoreAppeal(prisma, input);
    else await rejectScoreAppeal(prisma, input);
    refresh(matchId);
    return { ok: `Score appeal ${selected === "approve" ? "accepted" : "rejected"}.` };
  } catch (error) {
    return knownError(error);
  }
}
