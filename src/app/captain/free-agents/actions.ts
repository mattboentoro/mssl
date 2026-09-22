"use server";

import { revalidatePath } from "next/cache";

import type { RosterActionState } from "@/app/roster/actions";
import { AuthzError, requireCaptain } from "@/lib/authz";
import { CaptainFreeAgentError, placeFreeAgent } from "@/lib/captain-free-agents";
import { prisma } from "@/lib/prisma";
import { RosterError } from "@/lib/roster";

const value = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

export async function placeFreeAgentAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  try {
    const user = await requireCaptain();
    await placeFreeAgent(prisma, {
      actorId: user.appUserId,
      requestId: value(form, "requestId"),
      seasonId: value(form, "seasonId"),
      teamId: value(form, "teamId"),
      message: value(form, "message"),
    });
    revalidatePath("/captain/free-agents");
    revalidatePath("/captain/roster");
    revalidatePath("/roster");
    return { ok: "Roster invitation sent. The request stays open until the player accepts." };
  } catch (error) {
    if (
      error instanceof AuthzError ||
      error instanceof RosterError ||
      error instanceof CaptainFreeAgentError
    ) {
      return { error: error.message };
    }
    console.error("[free-agent placement] unhandled error", error);
    return { error: "The roster invitation could not be sent. Please try again." };
  }
}
