import type { Prisma, PrismaClient } from "@prisma/client";

import { writeAudit, type AuditActor } from "@/lib/audit";

type DbClient = PrismaClient | Prisma.TransactionClient;

export const MAX_NOTIFICATION_PAGE_SIZE = 100;
export const MAX_BROADCAST_RECIPIENTS = 100;
export const MAX_NOTIFICATION_TITLE_LENGTH = 120;
export const MAX_NOTIFICATION_BODY_LENGTH = 2_000;

export class NotificationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code:
      "INVALID_NOTIFICATION" | "FORBIDDEN" | "NOT_FOUND" | "RECIPIENT_LIMIT" | "NO_RECIPIENTS",
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

export function isSafeInternalHref(href: string): boolean {
  return (
    href.startsWith("/") &&
    !href.startsWith("//") &&
    !href.includes("\\") &&
    !/%(?:2f|5c|00|0a|0d)/i.test(href) &&
    !/[\u0000-\u001f\u007f]/.test(href)
  );
}

function validatedText(value: string, label: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new NotificationError(`${label} is required.`, 400, "INVALID_NOTIFICATION");
  }
  if (trimmed.length > maxLength) {
    throw new NotificationError(
      `${label} must be ${maxLength} characters or fewer.`,
      400,
      "INVALID_NOTIFICATION",
    );
  }
  return trimmed;
}

export async function createNotification(
  db: DbClient,
  input: { userId: string; type: string; title: string; body: string; href?: string | null },
) {
  const title = validatedText(input.title, "Title", MAX_NOTIFICATION_TITLE_LENGTH);
  const body = validatedText(input.body, "Message", MAX_NOTIFICATION_BODY_LENGTH);
  const type = validatedText(input.type, "Type", 80);
  if (input.href && !isSafeInternalHref(input.href)) {
    throw new NotificationError(
      "Notification links must be safe internal paths.",
      400,
      "INVALID_NOTIFICATION",
    );
  }
  return db.notification.create({
    data: { userId: input.userId, type, title, body, href: input.href ?? null },
  });
}

export async function listNotifications(db: DbClient, userId: string, limit = 50) {
  const take = Math.max(1, Math.min(Math.trunc(limit), MAX_NOTIFICATION_PAGE_SIZE));
  return db.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}

export async function unreadNotificationCount(db: DbClient, userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

export async function markNotificationRead(
  db: DbClient,
  input: { userId: string; notificationId: string; now?: Date },
): Promise<boolean> {
  const existing = await db.notification.findFirst({
    where: { id: input.notificationId, userId: input.userId },
    select: { readAt: true },
  });
  if (!existing) {
    throw new NotificationError("Notification not found.", 404, "NOT_FOUND");
  }
  if (existing.readAt) return false;
  const result = await db.notification.updateMany({
    where: { id: input.notificationId, userId: input.userId, readAt: null },
    data: { readAt: input.now ?? new Date() },
  });
  return result.count > 0;
}

export async function markAllNotificationsRead(
  db: DbClient,
  input: { userId: string; now?: Date },
): Promise<number> {
  const result = await db.notification.updateMany({
    where: { userId: input.userId, readAt: null },
    data: { readAt: input.now ?? new Date() },
  });
  return result.count;
}

export async function broadcastToTeam(
  db: DbClient,
  input: {
    actorId: string;
    actor: AuditActor;
    seasonId: string;
    teamId: string;
    title: string;
    body: string;
  },
): Promise<{ recipientCount: number }> {
  const title = validatedText(input.title, "Title", MAX_NOTIFICATION_TITLE_LENGTH);
  const body = validatedText(input.body, "Message", MAX_NOTIFICATION_BODY_LENGTH);

  const run = async (tx: DbClient) => {
    const assignment = await tx.teamCaptain.findFirst({
      where: {
        userId: input.actorId,
        seasonId: input.seasonId,
        teamId: input.teamId,
        status: "ACTIVE",
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new NotificationError(
        "Captain access for this team and season is required.",
        403,
        "FORBIDDEN",
      );
    }

    const [members, captains] = await Promise.all([
      tx.teamMembership.findMany({
        where: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          status: "ACTIVE",
          endedAt: null,
          user: { status: "ACTIVE" },
        },
        select: { userId: true },
      }),
      tx.teamCaptain.findMany({
        where: {
          seasonId: input.seasonId,
          teamId: input.teamId,
          status: "ACTIVE",
          revokedAt: null,
          userId: { not: null },
          user: { status: "ACTIVE" },
        },
        select: { userId: true },
      }),
    ]);
    const recipientIds = [
      ...new Set(
        [...members.map(({ userId }) => userId), ...captains.map(({ userId }) => userId)]
          .filter((userId): userId is string => Boolean(userId))
          .filter((userId) => userId !== input.actorId),
      ),
    ];
    if (!recipientIds.length) {
      throw new NotificationError(
        "There are no active teammates or co-captains to notify.",
        409,
        "NO_RECIPIENTS",
      );
    }
    if (recipientIds.length > MAX_BROADCAST_RECIPIENTS) {
      throw new NotificationError(
        `A broadcast is limited to ${MAX_BROADCAST_RECIPIENTS} recipients.`,
        409,
        "RECIPIENT_LIMIT",
      );
    }

    await tx.notification.createMany({
      data: recipientIds.map((userId) => ({
        userId,
        type: "TEAM_BROADCAST",
        title,
        body,
        href: `/teams/${encodeURIComponent(input.teamId)}`,
      })),
    });
    await writeAudit(tx, {
      actor: input.actor,
      action: "notification.team_broadcast",
      entity: "Team",
      entityId: input.teamId,
      metadata: {
        seasonId: input.seasonId,
        recipientCount: recipientIds.length,
        title,
      },
    });
    return { recipientCount: recipientIds.length };
  };

  return "$transaction" in db ? db.$transaction((tx) => run(tx)) : run(db);
}
