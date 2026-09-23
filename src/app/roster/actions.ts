"use server";

import { revalidatePath } from "next/cache";

import { AuthzError, requirePlayer, requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  cancelJoinRequest,
  cancelRosterInvitation,
  createJoinRequest,
  createRosterInvitation,
  decideJoinRequest,
  demoteRosterCaptain,
  leaveRoster,
  promoteRosterMember,
  removeRosterMember,
  respondToRosterInvitation,
  RosterError,
} from "@/lib/roster";

export interface RosterActionState {
  ok?: string;
  error?: string;
}

function value(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function required(form: FormData, key: string): string {
  const result = value(form, key);
  if (!result) throw new RosterError(`Missing ${key}.`, 400, "INVALID_REQUEST");
  return result;
}

function refreshRoster() {
  revalidatePath("/roster");
  revalidatePath("/player");
  revalidatePath("/captain");
  revalidatePath("/captain/roster");
  revalidatePath("/admin/roster");
}

async function run(operation: () => Promise<unknown>, success: string): Promise<RosterActionState> {
  try {
    await operation();
    refreshRoster();
    return { ok: success };
  } catch (error) {
    if (error instanceof AuthzError) return { error: error.message };
    if (error instanceof RosterError) return { error: error.message };
    console.error("[roster action] unhandled error", error);
    return { error: "The roster could not be updated. Please try again." };
  }
}

export async function requestToJoinAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requirePlayer();
    return createJoinRequest(prisma, {
      requesterId: user.appUserId,
      seasonId: required(form, "seasonId"),
      teamId: required(form, "teamId"),
      message: value(form, "message"),
    });
  }, "Your join request was sent.");
}

export async function cancelJoinRequestAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return cancelJoinRequest(prisma, {
      actorId: user.appUserId,
      requestId: required(form, "requestId"),
    });
  }, "The join request was cancelled.");
}

export async function decideJoinRequestAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  const decision = value(form, "decision");
  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return { error: "Choose approve or reject." };
  }
  return run(
    async () => {
      const user = await requireUser();
      return decideJoinRequest(prisma, {
        actorId: user.appUserId,
        requestId: required(form, "requestId"),
        decision,
      });
    },
    `The join request was ${decision === "ACCEPTED" ? "approved" : "rejected"}.`,
  );
}

export async function invitePlayerAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return createRosterInvitation(prisma, {
      invitedById: user.appUserId,
      seasonId: required(form, "seasonId"),
      teamId: required(form, "teamId"),
      email: value(form, "email") || null,
      message: value(form, "message"),
    });
  }, "The roster invitation was sent.");
}

export async function cancelInvitationAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return cancelRosterInvitation(prisma, {
      actorId: user.appUserId,
      invitationId: required(form, "invitationId"),
    });
  }, "The invitation was cancelled.");
}

export async function respondToInvitationAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  const decision = value(form, "decision");
  if (decision !== "ACCEPTED" && decision !== "REJECTED") {
    return { error: "Choose accept or reject." };
  }
  return run(
    async () => {
      const user = await requireUser();
      return respondToRosterInvitation(prisma, {
        actorId: user.appUserId,
        invitationId: required(form, "invitationId"),
        decision,
      });
    },
    `The invitation was ${decision === "ACCEPTED" ? "accepted" : "rejected"}.`,
  );
}

export async function leaveRosterAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return leaveRoster(prisma, {
      actorId: user.appUserId,
      membershipId: required(form, "membershipId"),
    });
  }, "You left the roster.");
}

export async function removeMemberAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return removeRosterMember(prisma, {
      actorId: user.appUserId,
      membershipId: required(form, "membershipId"),
    });
  }, "The player was removed.");
}

export async function promoteMemberAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return promoteRosterMember(prisma, {
      actorId: user.appUserId,
      membershipId: required(form, "membershipId"),
    });
  }, "The player is now a captain.");
}

export async function demoteCaptainAction(
  _state: RosterActionState,
  form: FormData,
): Promise<RosterActionState> {
  return run(async () => {
    const user = await requireUser();
    return demoteRosterCaptain(prisma, {
      actorId: user.appUserId,
      captainId: required(form, "captainId"),
    });
  }, "Captain access was removed.");
}
