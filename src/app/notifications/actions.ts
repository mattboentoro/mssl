"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/app/admin/actions";
import { AuthzError, requireUser } from "@/lib/authz";
import {
  broadcastToTeam,
  markAllNotificationsRead,
  markNotificationRead,
  NotificationError,
} from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

function actionFailure(error: unknown): ActionState {
  if (error instanceof AuthzError || error instanceof NotificationError) {
    return { error: error.message };
  }
  console.error("[notifications] action failed", error);
  return { error: "The notification action failed. Please try again." };
}

function value(form: FormData, key: string): string {
  const candidate = form.get(key);
  return typeof candidate === "string" ? candidate.trim() : "";
}

function refreshNotifications(): void {
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markNotificationReadAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const notificationId = value(form, "notificationId");
    if (!notificationId) return { error: "Notification id is required." };
    await markNotificationRead(prisma, { userId: user.appUserId, notificationId });
    refreshNotifications();
    return { ok: "Notification marked as read." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function markAllNotificationsReadAction(
  _previous: ActionState,
  _form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const count = await markAllNotificationsRead(prisma, { userId: user.appUserId });
    refreshNotifications();
    return { ok: count ? `${count} notification(s) marked as read.` : "Everything is read." };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function broadcastTeamNotificationAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const [seasonId = "", teamId = ""] = value(form, "context").split(":", 2);
    const result = await broadcastToTeam(prisma, {
      actorId: user.appUserId,
      actor: {
        id: user.appUserId,
        email: user.email,
        name: user.name,
        role: "captain",
      },
      seasonId,
      teamId,
      title: value(form, "title"),
      body: value(form, "body"),
    });
    refreshNotifications();
    return { ok: `Sent to ${result.recipientCount} teammate(s).` };
  } catch (error) {
    return actionFailure(error);
  }
}
